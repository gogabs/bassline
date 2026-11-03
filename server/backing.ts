/**
 * O que a backing track precisa do servidor local:
 * - buscar e baixar o áudio do YouTube com o yt-dlp, que não roda no navegador;
 * - guardar e servir o modelo de separação, baixado uma vez do Hugging Face.
 * A separação em si roda no navegador.
 */
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const DADOS = process.env.BASSLINE_DADOS ?? join(homedir(), ".bassline");
/** HTDemucs exportado pelo projeto demucs-web (licença MIT), com a transformada fora da rede. */
const MODELO_URL = "https://huggingface.co/timcsy/demucs-web-onnx/resolve/main/htdemucs_embedded.onnx";
const MODELO_ARQUIVO = join(DADOS, "htdemucs_embedded.onnx");

const SEM_YTDLP = "Não consegui preparar o yt-dlp, que baixa o áudio do YouTube. Confira a internet ou envie um arquivo de áudio.";

function json(res: ServerResponse, status: number, corpo: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

export interface VideoEncontrado {
  id: string;
  titulo: string;
  canal: string;
  /** Duração em segundos, ou null quando o YouTube não diz (como em transmissões ao vivo). */
  duracao: number | null;
}

/** Lê a saída do yt-dlp com --print "%(id)s\t%(title)s\t%(channel)s\t%(duration)s". */
export function lerBusca(saida: string): VideoEncontrado[] {
  return saida
    .split(/\r?\n/)
    .map((linha) => linha.split("\t"))
    .filter((p) => p.length >= 4 && ehIdDoYoutube(p[0]!))
    .map(([id, titulo, canal, duracao]) => {
      const d = Number(duracao);
      return { id: id!, titulo: titulo!, canal: canal === "NA" ? "" : canal!, duracao: Number.isFinite(d) && d > 0 ? Math.round(d) : null };
    });
}

export const ehIdDoYoutube = (id: string) => /^[A-Za-z0-9_-]{11}$/.test(id);

/** Versão do yt-dlp em um arquivo só, publicada pelo projeto para cada sistema. */
function ytdlpParaEsteSistema(): { arquivo: string; url: string } {
  const base = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/";
  if (process.platform === "win32") return { arquivo: "yt-dlp.exe", url: `${base}yt-dlp.exe` };
  if (process.platform === "darwin") return { arquivo: "yt-dlp", url: `${base}yt-dlp_macos` };
  return { arquivo: "yt-dlp", url: `${base}yt-dlp_linux` };
}

let preparandoYtdlp: Promise<string> | null = null;

/**
 * Acha o yt-dlp. Usa o da variável YTDLP, se existir; senão a cópia do app; senão o
 * instalado no sistema; e, se não houver nenhum, baixa a cópia do app na primeira vez.
 */
function prepararYtdlp(): Promise<string> {
  if (process.env.YTDLP) return Promise.resolve(process.env.YTDLP);
  preparandoYtdlp ??= (async () => {
    const { arquivo, url } = ytdlpParaEsteSistema();
    const copia = join(DADOS, arquivo);
    if (await existe(copia)) return copia;
    if (await funciona("yt-dlp")) return "yt-dlp";
    await mkdir(DADOS, { recursive: true });
    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok || !r.body) throw Object.assign(new Error("download do yt-dlp falhou"), { code: "ENOENT" });
    const parcial = `${copia}.${process.pid}.parcial`;
    await pipeline(Readable.fromWeb(r.body as never), createWriteStream(parcial));
    await chmod(parcial, 0o755);
    await rename(parcial, copia);
    return copia;
  })().catch((e) => {
    preparandoYtdlp = null;
    throw e;
  });
  return preparandoYtdlp;
}

async function existe(caminho: string): Promise<boolean> {
  try {
    await stat(caminho);
    return true;
  } catch {
    return false;
  }
}

function funciona(programa: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(programa, ["--version"], { windowsHide: true });
    p.on("error", () => resolve(false));
    p.on("close", (codigo) => resolve(codigo === 0));
  });
}

async function rodarYtdlp(args: string[], limiteMs: number): Promise<{ codigo: number; saida: string; erro: string }> {
  const programa = await prepararYtdlp();
  return new Promise((resolve, reject) => {
    const p = spawn(programa, args, { windowsHide: true });
    let saida = "";
    let erro = "";
    p.stdout.setEncoding("utf8").on("data", (d: string) => (saida += d));
    p.stderr.setEncoding("utf8").on("data", (d: string) => (erro += d));
    const timer = setTimeout(() => p.kill(), limiteMs);
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (codigo) => {
      clearTimeout(timer);
      resolve({ codigo: codigo ?? 1, saida, erro });
    });
  });
}

/** O YouTube muda com frequência e versões velhas do yt-dlp param de funcionar: tenta atualizar uma vez. */
let jaAtualizou = false;
async function atualizarYtdlp(): Promise<boolean> {
  if (jaAtualizou) return false;
  jaAtualizou = true;
  const r = await rodarYtdlp(["-U"], 120_000).catch(() => null);
  return r?.codigo === 0;
}

const naoInstalado = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";

export async function buscarNoYoutube(busca: string, res: ServerResponse) {
  const q = busca.trim().slice(0, 200);
  if (!q) return json(res, 400, { erro: "Escreva o nome da música para buscar." });
  try {
    const r = await rodarYtdlp(
      [`ytsearch5:${q}`, "--flat-playlist", "--no-warnings", "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration)s"],
      30_000,
    );
    if (r.codigo !== 0) return json(res, 502, { erro: "O YouTube não respondeu à busca. Tente de novo ou atualize o yt-dlp." });
    return json(res, 200, { videos: lerBusca(r.saida) });
  } catch (e) {
    return json(res, naoInstalado(e) ? 503 : 500, { erro: naoInstalado(e) ? SEM_YTDLP : "A busca falhou." });
  }
}

const TIPOS_AUDIO: Record<string, string> = {
  m4a: "audio/mp4",
  webm: "audio/webm",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
};

export async function baixarDoYoutube(id: string, res: ServerResponse) {
  if (!ehIdDoYoutube(id)) return json(res, 400, { erro: "Esse vídeo não parece ser do YouTube." });
  const pasta = await mkdtemp(join(tmpdir(), "bassline-"));
  try {
    const args = ["-f", "bestaudio[ext=m4a]/bestaudio", "--no-playlist", "--no-warnings", "-o", join(pasta, "audio.%(ext)s"), `https://www.youtube.com/watch?v=${id}`];
    let r = await rodarYtdlp(args, 5 * 60_000);
    if (r.codigo !== 0 && (await atualizarYtdlp())) r = await rodarYtdlp(args, 5 * 60_000);
    const arquivo = (await readdir(pasta)).find((n) => n.startsWith("audio."));
    if (r.codigo !== 0 || !arquivo) {
      return json(res, 502, { erro: "Não consegui baixar o áudio desse vídeo. Tente outro resultado, atualize o yt-dlp ou envie um arquivo de áudio." });
    }
    const caminho = join(pasta, arquivo);
    const { size } = await stat(caminho);
    res.writeHead(200, {
      "content-type": TIPOS_AUDIO[arquivo.split(".").pop()!] ?? "application/octet-stream",
      "content-length": String(size),
    });
    await pipeline(createReadStream(caminho), res);
  } catch (e) {
    if (!res.headersSent) json(res, naoInstalado(e) ? 503 : 500, { erro: naoInstalado(e) ? SEM_YTDLP : "O download falhou." });
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

/**
 * Serve o modelo. Na primeira vez, baixa do Hugging Face e manda para o navegador ao mesmo
 * tempo que grava no disco, para o app mostrar o progresso desde o começo.
 */
export async function servirModelo(_req: IncomingMessage, res: ServerResponse) {
  try {
    const { size } = await stat(MODELO_ARQUIVO);
    res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(size) });
    await pipeline(createReadStream(MODELO_ARQUIVO), res);
    return;
  } catch {
    if (res.headersSent) return;
  }
  try {
    await mkdir(DADOS, { recursive: true });
    const r = await fetch(MODELO_URL, { redirect: "follow" });
    if (!r.ok || !r.body) throw new Error(`Hugging Face respondeu ${r.status}`);
    const tamanho = r.headers.get("content-length");
    res.writeHead(200, { "content-type": "application/octet-stream", ...(tamanho ? { "content-length": tamanho } : {}) });
    const parcial = `${MODELO_ARQUIVO}.${process.pid}.parcial`;
    const disco = createWriteStream(parcial);
    const origem = Readable.fromWeb(r.body as never);
    origem.on("data", (pedaco: Buffer) => {
      disco.write(pedaco);
      res.write(pedaco);
    });
    await new Promise<void>((resolve, reject) => {
      origem.on("end", resolve);
      origem.on("error", reject);
    });
    res.end();
    await new Promise<void>((resolve, reject) => disco.end((e?: Error | null) => (e ? reject(e) : resolve())));
    await rename(parcial, MODELO_ARQUIVO);
  } catch {
    if (!res.headersSent) json(res, 502, { erro: "Não consegui baixar o modelo que separa o baixo. Confira a internet e tente de novo." });
    else res.destroy();
  }
}
