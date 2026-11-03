const PT_SUSTENIDO = ["Dó", "Dó sustenido", "Ré", "Ré sustenido", "Mi", "Fá", "Fá sustenido", "Sol", "Sol sustenido", "Lá", "Lá sustenido", "Si"];
const PT_BEMOL = ["Dó", "Ré bemol", "Ré", "Mi bemol", "Mi", "Fá", "Sol bemol", "Sol", "Lá bemol", "Lá", "Si bemol", "Si"];
// Em inglês os nomes são lidos por extenso para o NVDA não soletrar "C#" de forma estranha.
const EN_SUSTENIDO = ["C", "C sharp", "D", "D sharp", "E", "F", "F sharp", "G", "G sharp", "A", "A sharp", "B"];
const EN_BEMOL = ["C", "D flat", "D", "E flat", "E", "F", "G flat", "G", "A flat", "A", "B flat", "B"];

/** Nome da nota a partir da altura MIDI, sem oitava. */
export function nomeDaNota(midi: number, nomes: "pt" | "en", acidentes: "sustenido" | "bemol"): string {
  const classe = ((midi % 12) + 12) % 12;
  const tabela = nomes === "pt" ? (acidentes === "sustenido" ? PT_SUSTENIDO : PT_BEMOL) : acidentes === "sustenido" ? EN_SUSTENIDO : EN_BEMOL;
  return tabela[classe]!;
}
