/**
 * Como conversar com o HTDemucs exportado pelo demucs-web.
 *
 * Nesse modelo, a transformada de Fourier fica fora da rede: entram a onda e o espectro do
 * trecho, e saem duas estimativas de cada faixa, uma no tempo e outra no espectro. A faixa
 * final é a soma das duas.
 */
import type { InferenceSession, Tensor } from "onnxruntime-web";
import { prepareModelInput, standaloneIspec, standaloneMask } from "demucs-web/processor";
import { TRECHO, type RodarModelo } from "./separar";

const BAIXO = 1;

export function rodarComSessao(sessao: InferenceSession, CriarTensor: typeof Tensor): RodarModelo {
  return async (entrada) => {
    const esquerdo = entrada.subarray(0, TRECHO);
    const direito = entrada.subarray(TRECHO, 2 * TRECHO);
    const { waveform, magSpec, numBins, numFrames } = prepareModelInput(esquerdo, direito);
    const [nomeOnda, nomeEspectro] = sessao.inputNames;
    const saida = await sessao.run({
      [nomeOnda!]: new CriarTensor("float32", waveform, [1, 2, TRECHO]),
      [nomeEspectro!]: new CriarTensor("float32", magSpec, [1, 4, numBins, numFrames]),
    });
    let tempo: Float32Array | null = null;
    let espectro: Float32Array | null = null;
    for (const t of Object.values(saida)) {
      if (t.dims.length === 4) tempo = t.data as Float32Array;
      else if (t.dims.length === 5) espectro = t.data as Float32Array;
    }
    if (!tempo || !espectro) throw new Error("O modelo devolveu algo inesperado.");
    const doEspectro = standaloneIspec(standaloneMask(espectro)[BAIXO]!, TRECHO);
    const baixo = new Float32Array(2 * TRECHO);
    const base = BAIXO * 2 * TRECHO;
    for (let i = 0; i < TRECHO; i++) {
      baixo[i] = tempo[base + i]! + doEspectro.left[i]!;
      baixo[TRECHO + i] = tempo[base + TRECHO + i]! + doEspectro.right[i]!;
    }
    return baixo;
  };
}
