import { OPCOES_PADRAO, type OpcoesNarracao } from "../narrador";

/** Tudo o que o usuário pode configurar. As opções do narrador ficam junto. */
export interface Preferencias extends OpcoesNarracao {
  /** Qual narrador usar, pelo id do registro. */
  narrador: string;
  /** Andamento do som, em batidas por minuto. Cada compasso tem 4 batidas. */
  bpm: number;
  /** Volume, de 0 a 100. */
  volume: number;
  timbre: "redondo" | "brilhante";
  /** O que P maiúsculo significa dentro da linha de uma corda. */
  pMaiusculo: "pop" | "pull-off";
}

export const PREFERENCIAS_PADRAO: Preferencias = {
  ...OPCOES_PADRAO,
  narrador: "pt-br",
  bpm: 90,
  volume: 80,
  timbre: "redondo",
  pMaiusculo: "pop",
};

const CHAVE = "bassline.preferencias";

export function carregarPreferencias(): Preferencias {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) return { ...PREFERENCIAS_PADRAO, ...(JSON.parse(salvo) as Partial<Preferencias>) };
  } catch {
    // Sem armazenamento disponível: usa o padrão.
  }
  return { ...PREFERENCIAS_PADRAO };
}

export function salvarPreferencias(p: Preferencias): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Ignora: as preferências valem só nesta sessão.
  }
}
