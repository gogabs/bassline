/**
 * Lado da página: decodifica o áudio e conversa com o trabalhador que separa o baixo.
 */
import type { MensagemDoTrabalhador } from "./mensagens";
import { TAXA, type Estereo, type Separado } from "./separar";

/** Decodifica qualquer áudio que o Chrome entende, já em 44,1 kHz e estéreo. */
export async function decodificar(dados: ArrayBuffer): Promise<Estereo> {
  const ctx = new OfflineAudioContext(2, 1, TAXA);
  const audio = await ctx.decodeAudioData(dados);
  const esquerdo = audio.getChannelData(0).slice();
  const direito = audio.numberOfChannels > 1 ? audio.getChannelData(1).slice() : esquerdo.slice();
  return { esquerdo, direito };
}

export interface Separacao {
  resultado: Promise<Separado>;
  cancelar(): void;
}

export function separar(musica: Estereo, aoAvisar: (m: MensagemDoTrabalhador) => void): Separacao {
  const w = new Worker(new URL("./trabalhador.ts", import.meta.url), { type: "module" });
  const esquerdo = musica.esquerdo.slice();
  const direito = musica.direito.slice();
  let desistir = (_e: Error) => {};
  const resultado = new Promise<Separado>((resolve, reject) => {
    desistir = (e) => {
      reject(e);
      w.terminate();
    };
    w.onmessage = (e: MessageEvent<MensagemDoTrabalhador>) => {
      const m = e.data;
      aoAvisar(m);
      if (m.tipo === "pronto") resolve({ semBaixo: m.semBaixo, baixo: m.baixo });
      else if (m.tipo === "erro") reject(new Error(m.mensagem));
      else if (m.tipo === "cancelado") reject(new DOMException("Cancelado", "AbortError"));
      else return;
      w.terminate();
    };
    w.onerror = () => {
      reject(new Error("O separador parou com um erro."));
      w.terminate();
    };
  });
  w.postMessage({ tipo: "separar", esquerdo, direito }, [esquerdo.buffer, direito.buffer]);
  return {
    resultado,
    cancelar: () => {
      w.postMessage({ tipo: "cancelar" });
      // Se o trabalhador estiver no meio de um trecho, encerra de vez.
      setTimeout(() => desistir(new DOMException("Cancelado", "AbortError")), 2000);
    },
  };
}
