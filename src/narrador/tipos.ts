import type { Measure, Song, TabEvent } from "../parser";

/**
 * Contrato de um narrador.
 *
 * Um narrador transforma a música que o parser devolve em frases. Ele não sabe nada da
 * interface: não importa Preact nem usa o DOM. A interface, o HTML exportado e a linha de
 * comando só mostram o que o narrador devolve. Para criar outro narrador (outro idioma,
 * mais compacto, mais detalhado), basta implementar esta interface e registrá-lo.
 */
export interface Narrador {
  id: string;
  /** Nome mostrado nas configurações. */
  nome: string;
  narrar(song: Song, opcoes: OpcoesNarracao): Narracao;
}

export interface OpcoesNarracao {
  /** Como cada nota é lida: corda e casa, nome da nota, ou os dois. */
  leitura: "posicao" | "nome" | "ambos";
  /** Nomes das notas: Dó, Ré, Mi ou C, D, E. */
  nomes: "pt" | "en";
  acidentes: "sustenido" | "bemol";
  /** Quando falar as técnicas: sempre, só na primeira vez em cada compasso, ou nunca. */
  tecnicas: "sempre" | "primeira" | "nunca";
  /** Juntar eventos iguais seguidos, como "E3, 4 vezes". */
  juntarRepetidas: boolean;
  /** Juntar compassos iguais seguidos num bloco só. */
  juntarCompassos: boolean;
}

export const OPCOES_PADRAO: OpcoesNarracao = {
  leitura: "posicao",
  nomes: "pt",
  acidentes: "sustenido",
  tecnicas: "sempre",
  juntarRepetidas: true,
  juntarCompassos: true,
};

export interface Narracao {
  /** Uma ou duas frases sobre a música: afinação, compassos, técnicas. */
  resumo: string;
  /** Avisos, como símbolos que o parser não entendeu. */
  avisos: AvisoNarrado[];
  secoes: SecaoNarrada[];
}

export interface AvisoNarrado {
  texto: string;
  /** Compasso a que o aviso se refere, quando houver. */
  compasso: number | null;
}

export interface SecaoNarrada {
  /** Título da seção, como "Refrão". Quando a tab não dá nome, o narrador cria um. */
  titulo: string;
  /** true quando a tab não deu nome e o título foi criado pelo narrador. */
  semNome: boolean;
  blocos: BlocoNarrado[];
}

/** Um compasso, ou vários compassos iguais seguidos que viraram um só. */
export interface BlocoNarrado {
  /** Ex.: "Compasso 3" ou "Compassos 1 a 4, iguais". */
  titulo: string;
  /** Texto do botão de tocar, ex.: "Tocar compasso 3". */
  rotuloTocar: string;
  /** Compassos que este bloco representa, em ordem. O primeiro é o que toca. */
  compassos: Measure[];
  itens: ItemNarrado[];
}

/** Um símbolo da tab, já em frase. Pode juntar vários eventos iguais seguidos. */
export interface ItemNarrado {
  texto: string;
  eventos: TabEvent[];
}
