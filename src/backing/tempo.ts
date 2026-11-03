/** Tempo falado, como "1 minuto e 5 segundos". */
export function falarTempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const m = Math.floor(s / 60);
  const r = s % 60;
  const min = m === 1 ? "1 minuto" : `${m} minutos`;
  const seg = r === 1 ? "1 segundo" : `${r} segundos`;
  if (m === 0) return seg;
  if (r === 0) return min;
  return `${min} e ${seg}`;
}

/** Estimativa curta do que falta, arredondada para não soar falsa. */
export function falarFalta(segundos: number): string {
  if (segundos < 60) return "menos de 1 minuto";
  const m = Math.round(segundos / 60);
  return m === 1 ? "cerca de 1 minuto" : `cerca de ${m} minutos`;
}
