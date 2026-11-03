import { TAXA, type Separado } from "./separar";

/**
 * Junta a música sem o baixo com o baixo no volume pedido e gera um WAV de 16 bits.
 * volumeBaixo vai de 0 (só a backing track) a 1 (a música original).
 */
export function mixarWav(faixas: Separado, volumeBaixo: number): Blob {
  const { semBaixo, baixo } = faixas;
  const n = semBaixo.esquerdo.length;
  const bytes = new ArrayBuffer(44 + n * 4);
  const v = new DataView(bytes);
  const texto = (pos: number, s: string) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, "RIFF");
  v.setUint32(4, 36 + n * 4, true);
  texto(8, "WAVE");
  texto(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, TAXA, true);
  v.setUint32(28, TAXA * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  texto(36, "data");
  v.setUint32(40, n * 4, true);
  const amostras = new Int16Array(bytes, 44, n * 2);
  const conv = (x: number) => Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  for (let i = 0; i < n; i++) {
    amostras[2 * i] = conv(semBaixo.esquerdo[i]! + volumeBaixo * baixo.esquerdo[i]!);
    amostras[2 * i + 1] = conv(semBaixo.direito[i]! + volumeBaixo * baixo.direito[i]!);
  }
  return new Blob([bytes], { type: "audio/wav" });
}
