/**
 * Separação do baixo com o HTDemucs.
 *
 * O modelo recebe trechos de 7,8 segundos em estéreo a 44,1 kHz e separa quatro faixas:
 * bateria, baixo, outros e voz. Aqui só o baixo interessa. A música é cortada em trechos que
 * se sobrepõem um quarto, e as bordas são misturadas com rampas, para não haver cliques nas
 * emendas.
 *
 * Este arquivo não conhece o ONNX: quem roda o modelo é passado como função, e assim a
 * lógica de cortar e emendar pode ser testada sem o modelo.
 */

export const TAXA = 44_100;
export const TRECHO = 343_980;

/** Áudio estéreo: dois canais do mesmo tamanho, a 44,1 kHz. */
export interface Estereo {
  esquerdo: Float32Array;
  direito: Float32Array;
}

/**
 * Roda o modelo num trecho.
 * Entrada: [esquerdo..., direito...], com TRECHO amostras por canal.
 * Saída: só a faixa do baixo, [esquerdo..., direito...], também com TRECHO amostras por canal.
 */
export type RodarModelo = (entrada: Float32Array) => Promise<Float32Array>;

export interface Separado {
  /** A música sem o baixo: original menos o baixo, para nada além do baixo mudar. */
  semBaixo: Estereo;
  baixo: Estereo;
}

function rampa(n: number, sobreposicao: number, primeiro: boolean, ultimo: boolean): Float32Array {
  const w = new Float32Array(n).fill(1);
  for (let i = 0; i < sobreposicao; i++) {
    const v = (i + 1) / (sobreposicao + 1);
    if (!primeiro) w[i] = v;
    if (!ultimo) w[n - 1 - i] = v;
  }
  return w;
}

export function quantosTrechos(amostras: number): number {
  const passo = TRECHO - Math.floor(TRECHO / 4);
  return Math.max(1, Math.ceil(Math.max(0, amostras - TRECHO) / passo) + 1);
}

export async function separarBaixo(
  musica: Estereo,
  rodar: RodarModelo,
  aoProgredir?: (feitos: number, total: number) => void,
  sinal?: AbortSignal,
): Promise<Separado> {
  const total = musica.esquerdo.length;
  const sobreposicao = Math.floor(TRECHO / 4);
  const passo = TRECHO - sobreposicao;
  const n = quantosTrechos(total);
  const baixoE = new Float32Array(total);
  const baixoD = new Float32Array(total);
  const peso = new Float32Array(total);
  const entrada = new Float32Array(2 * TRECHO);

  aoProgredir?.(0, n);
  for (let k = 0; k < n; k++) {
    if (sinal?.aborted) throw new DOMException("Cancelado", "AbortError");
    const inicio = k * passo;
    const fim = Math.min(inicio + TRECHO, total);
    const tamanho = fim - inicio;
    entrada.fill(0);
    entrada.set(musica.esquerdo.subarray(inicio, fim), 0);
    entrada.set(musica.direito.subarray(inicio, fim), TRECHO);
    const saida = await rodar(entrada);
    const w = rampa(tamanho, Math.min(sobreposicao, Math.floor(tamanho / 2)), k === 0, k === n - 1);
    for (let i = 0; i < tamanho; i++) {
      baixoE[inicio + i]! += saida[i]! * w[i]!;
      baixoD[inicio + i]! += saida[TRECHO + i]! * w[i]!;
      peso[inicio + i]! += w[i]!;
    }
    aoProgredir?.(k + 1, n);
  }

  const semE = new Float32Array(total);
  const semD = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const p = peso[i]! > 1e-6 ? peso[i]! : 1;
    baixoE[i] = baixoE[i]! / p;
    baixoD[i] = baixoD[i]! / p;
    semE[i] = musica.esquerdo[i]! - baixoE[i]!;
    semD[i] = musica.direito[i]! - baixoD[i]!;
  }
  return { semBaixo: { esquerdo: semE, direito: semD }, baixo: { esquerdo: baixoE, direito: baixoD } };
}
