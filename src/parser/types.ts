/**
 * Formato de dados produzido pelo parser.
 *
 * O parser devolve só dados estruturados. Nenhum texto pronto para leitura sai daqui:
 * quem transforma isso em frases (corda e casa, nome da nota, ou os dois) é o narrador,
 * no lado da interface.
 *
 * Convenção de cordas: segue a do baixo, corda 1 é a mais aguda (G no baixo de 4 cordas).
 */

/** Técnicas aplicadas a uma única nota. */
export type NoteTechnique =
  | "ghost" // nota fantasma, escrita como (5)
  | "dead" // nota morta, escrita como x
  | "vibrato" // ~
  | "natural-harmonic" // <12>, [12] ou 12*
  | "artificial-harmonic" // 5AH, 5PH
  | "slap" // T ou S antes da nota, ou na linha de anotação
  | "pop" // P antes da nota, ou na linha de anotação
  | "tap" // t antes da nota
  | "palm-mute" // trecho marcado com PM na linha de anotação
  | "slide-in" // slide que chega na nota sem nota de partida
  | "slide-out" // slide que sai da nota sem nota de chegada
  | "bend" // b, com alvo opcional em bendTo
  | "release"; // r, com alvo opcional em releaseTo

/** Técnicas que ligam uma nota à próxima nota da mesma corda. */
export type LinkTechnique = "hammer-on" | "pull-off" | "slide-up" | "slide-down" | "slide";

export interface NoteLink {
  technique: LinkTechnique;
  /** Casa da nota de chegada. */
  toFret: number;
}

export interface Note {
  /** Nome da corda como aparece na tab (ex.: "E", "A", "D", "G", "B"). */
  string: string;
  /** Número da corda, 1 = mais aguda. */
  stringNumber: number;
  /** Casa. null quando a nota é morta (x) e não tem casa. */
  fret: number | null;
  /** Altura MIDI, quando dá para calcular a partir da afinação. Útil para o áudio. */
  midi: number | null;
  techniques: NoteTechnique[];
  /** Ligação com a próxima nota da mesma corda (hammer-on, pull-off, slide). */
  linkTo?: NoteLink;
  /** Esta nota é a chegada de uma ligação vinda da nota anterior. */
  linkedFrom?: LinkTechnique;
  bendTo?: number;
  releaseTo?: number;
}

/** Notas que começam na mesma coluna da tab, tocadas juntas (uma nota ou um acorde). */
export interface TabEvent {
  /** Posição aproximada dentro do compasso, de 0 (início) a 1 (fim). */
  position: number;
  /** Coluna no texto original, para depuração e para alinhar com o áudio. */
  column: number;
  notes: Note[];
}

export interface Measure {
  /** Número do compasso na música inteira, começando em 1. */
  number: number;
  events: TabEvent[];
  /** Primeiro compasso de um trecho que se repete. */
  repeatStart?: boolean;
  /** Último compasso de um trecho que se repete, com quantas vezes ele é tocado no total. */
  repeatEnd?: { times: number | null };
}

export interface Section {
  /** Rótulo da seção, como "Intro" ou "Refrão". null quando a tab não dá nome. */
  label: string | null;
  measures: Measure[];
}

export interface UnknownSymbol {
  symbol: string;
  /** Número do compasso (global) onde o símbolo apareceu. */
  measureNumber: number;
  /** Nome da corda onde o símbolo apareceu, ou null se veio de uma linha de anotação. */
  string: string | null;
  /** Linha do texto original, começando em 1. */
  line: number;
  column: number;
}

export interface Song {
  /** Afinação, da corda mais grave para a mais aguda (ex.: ["E", "A", "D", "G"]). */
  tuning: string[];
  stringCount: number;
  sections: Section[];
  unknownSymbols: UnknownSymbol[];
  /** Avisos de leitura, como blocos com número de cordas diferente. */
  warnings: string[];
}

export interface ParseOptions {
  /**
   * Como ler P maiúsculo dentro da linha de uma corda. O padrão é "pop".
   * Se a tab tiver uma legenda dizendo o contrário, a legenda vence.
   */
  capitalP?: "pop" | "pull-off";
}
