/// <reference lib="webworker" />
/**
 * Roda o modelo de separação fora da tela, para a página continuar respondendo ao NVDA
 * enquanto o baixo é separado. Usa a placa de vídeo (WebGPU) quando o Chrome deixa,
 * e o processador quando não.
 */
import * as ort from "onnxruntime-web/webgpu";
import { rodarComSessao } from "./modelo";
import { separarBaixo } from "./separar";
import type { MensagemDoTrabalhador, PedidoAoTrabalhador } from "./mensagens";

declare const self: DedicatedWorkerGlobalScope;

const CACHE = "bassline-modelo-v2";
const URL_MODELO = "/api/modelo";

function enviar(m: MensagemDoTrabalhador, transferir: Transferable[] = []) {
  self.postMessage(m, transferir);
}

async function lerModelo(): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const guardado = await cache.match(URL_MODELO);
    if (guardado) return new Uint8Array(await guardado.arrayBuffer());
  } catch {
    // Sem Cache Storage: baixa toda vez do servidor local.
  }
  const r = await fetch(URL_MODELO);
  if (!r.ok || !r.body) {
    const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
    throw new Error(corpo?.erro ?? "Não consegui baixar o modelo que separa o baixo.");
  }
  const total = Number(r.headers.get("content-length")) || 0;
  const partes: Uint8Array[] = [];
  let recebido = 0;
  const leitor = r.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    recebido += value.length;
    enviar({ tipo: "modelo", recebido, total });
  }
  const bytes = new Uint8Array(recebido);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.length;
  }
  try {
    await cache?.put(URL_MODELO, new Response(bytes));
  } catch {
    // Sem espaço: na próxima vez baixa de novo.
  }
  return bytes;
}

let sessao: { s: ort.InferenceSession; placa: boolean } | null = null;

async function abrirSessao(): Promise<{ s: ort.InferenceSession; placa: boolean }> {
  if (sessao) return sessao;
  const modelo = await lerModelo();
  enviar({ tipo: "preparando" });
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1;
  // Placa de vídeo emulada no processador é mais lenta que o próprio processador: fica de fora.
  type Adaptador = { isFallbackAdapter?: boolean; info?: { isFallbackAdapter?: boolean } };
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<Adaptador | null> } }).gpu;
  // Em alguns computadores o pedido da placa nunca responde: espera no máximo 3 segundos.
  const semResposta = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
  const adaptador = gpu ? await Promise.race([gpu.requestAdapter().catch(() => null), semResposta]) : null;
  console.debug("Bassline: placa de vídeo", adaptador ? JSON.stringify(adaptador.info ?? {}) : "nenhuma");
  const temPlaca = !!adaptador && !adaptador.isFallbackAdapter && !adaptador.info?.isFallbackAdapter;
  if (temPlaca) {
    try {
      sessao = { s: await ort.InferenceSession.create(modelo, { executionProviders: ["webgpu"], graphOptimizationLevel: "all" }), placa: true };
      return sessao;
    } catch {
      // A placa não deu conta do modelo: usa o processador.
    }
  }
  sessao = { s: await ort.InferenceSession.create(modelo, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }), placa: false };
  return sessao;
}

let cancelar: AbortController | null = null;

self.onmessage = async (e: MessageEvent<PedidoAoTrabalhador>) => {
  const pedido = e.data;
  if (pedido.tipo === "cancelar") {
    cancelar?.abort();
    return;
  }
  cancelar = new AbortController();
  try {
    const { s, placa } = await abrirSessao();
    const inicio = performance.now();
    const r = await separarBaixo(
      { esquerdo: pedido.esquerdo, direito: pedido.direito },
      rodarComSessao(s, ort.Tensor),
      (feitos, total) => enviar({ tipo: "separando", feitos, total, placa, segundos: (performance.now() - inicio) / 1000 }),
      cancelar.signal,
    );
    enviar(
      { tipo: "pronto", semBaixo: r.semBaixo, baixo: r.baixo },
      [r.semBaixo.esquerdo.buffer, r.semBaixo.direito.buffer, r.baixo.esquerdo.buffer, r.baixo.direito.buffer],
    );
  } catch (erro) {
    if ((erro as Error).name === "AbortError") enviar({ tipo: "cancelado" });
    else enviar({ tipo: "erro", mensagem: (erro as Error).message || "A separação falhou." });
  }
};
