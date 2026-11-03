import type {
  LinkTechnique,
  Measure,
  Note,
  NoteTechnique,
  ParseOptions,
  Section,
  Song,
  TabEvent,
  UnknownSymbol,
} from "./types";

/** Afinações padrão, da corda mais grave para a mais aguda, usadas quando a tab não nomeia as cordas. */
const DEFAULT_TUNINGS: Record<number, string[]> = {
  4: ["E", "A", "D", "G"],
  5: ["B", "E", "A", "D", "G"],
  6: ["B", "E", "A", "D", "G", "C"],
};

/** Alturas MIDI de referência das cordas soltas na afinação padrão, da mais grave para a mais aguda. */
const REFERENCE_MIDI: Record<number, number[]> = {
  4: [28, 33, 38, 43],
  5: [23, 28, 33, 38, 43],
  6: [23, 28, 33, 38, 43, 48],
};

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const SECTION_KEYWORDS =
  /^(intro|introdu[cç][aã]o|verse|verso|estrofe|chorus|refr[aã]o|bridge|ponte|solo|outro|final|fim|pre[- ]?chorus|pr[eé][- ]?refr[aã]o|riff|interl[uú]dio|interlude|break|breakdown|coda|parte|part)\b/i;

interface StringLine {
  lineIndex: number;
  raw: string;
  name: string | null;
  /** Coluna onde começa o corpo da linha (depois do nome e da primeira barra). */
  bodyStart: number;
}

interface Block {
  lines: StringLine[];
  /** Linha logo acima do bloco, se for uma linha de anotação (PM, T, P). */
  annotationAbove: number | null;
  annotationBelow: number | null;
  repeatTimes: number | null;
  /** Rótulo de seção encontrado entre o bloco anterior e este. */
  label: string | null;
}

interface TokenNote extends Note {
  column: number;
}

interface ReadRules {
  capitalP: "pop" | "pull-off";
  lowercaseP: "pop" | "pull-off";
  /** A música tem casas de 10 a 15 escritas com dois dígitos, então casas de 16 a 24 são plausíveis. */
  highFrets: boolean;
  /** Chamado quando números grudados são lidos como casas separadas. */
  onSplit: (run: string) => void;
}

/** Caracteres invisíveis que sites como o Cifra Club colocam no texto. */
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF]/g;

export function parseTab(text: string, options: ParseOptions = {}): Song {
  const lines = text.replace(INVISIBLE, "").replace(/\u00A0/g, " ").split(/\r?\n/);
  const legend = readLegend(lines);
  const capitalP = legend.capitalP ?? options.capitalP ?? "pop";
  const lowercaseP = legend.lowercaseP ?? "pull-off";

  const blocks = findBlocks(lines);
  const warnings: string[] = [];
  const unknownSymbols: UnknownSymbol[] = [];
  const sections: Section[] = [];

  const headerTuning = readHeaderTuning(lines);
  let tuning: string[] | null = null;
  let stringCount = 0;
  let measureNumber = 0;
  const highFrets = hasMidRangeFrets(blocks);
  const splitRuns = new Set<string>();

  for (const block of blocks) {
    const count = block.lines.length;
    const names = blockNames(block, headerTuning);
    const blockTuning = [...names].reverse();
    if (!tuning) {
      tuning = blockTuning;
      stringCount = count;
    } else if (count !== stringCount || blockTuning.join(" ") !== tuning.join(" ")) {
      warnings.push(
        `O bloco da linha ${block.lines[0]!.lineIndex + 1} tem afinação ${blockTuning.join(" ")}, diferente de ${tuning.join(" ")}.`,
      );
    }
    const midiByLine = openStringMidi(names);

    if (block.label !== null || sections.length === 0) {
      const last = sections[sections.length - 1];
      if (last && last.measures.length === 0 && block.label === null) {
        // Seção vazia já aberta: continua nela.
      } else {
        sections.push({ label: block.label, measures: [] });
      }
    }
    const section = sections[sections.length - 1]!;

    const result = parseBlock(block, lines, names, midiByLine, measureNumber, {
      capitalP,
      lowercaseP,
      highFrets,
      onSplit: (run) => splitRuns.add(run),
    });
    measureNumber += result.measures.length;
    unknownSymbols.push(...result.unknown);
    section.measures.push(...result.measures);
  }

  if (splitRuns.size > 0) {
    warnings.push(
      `Números grudados lidos como casas separadas: ${[...splitRuns].join(", ")}. Confira com a gravação.`,
    );
  }

  return {
    tuning: tuning ?? DEFAULT_TUNINGS[4]!,
    stringCount: stringCount || 4,
    sections: sections.filter((s) => s.measures.length > 0 || s.label !== null),
    unknownSymbols,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Encontrar blocos de cordas, rótulos e repetições
// ---------------------------------------------------------------------------

const TAB_CHARS = /[-0-9|hHpPbrsStTx~/\\()<>[\]*.:AHvX ]/;

export function readStringLine(raw: string, lineIndex: number): StringLine | null {
  const m = /^(\s*)([A-Ga-g][#b]?)?(\s*)(\|\|?|:)?/.exec(raw);
  if (!m) return null;
  const name = m[2] ? m[2][0]!.toUpperCase() + m[2].slice(1) : null;
  const hasBar = Boolean(m[4]);
  if (!name && !hasBar) return null;
  const bodyStart = m[0].length;
  const body = raw.slice(bodyStart);
  if (!name && !body.trimStart().startsWith("-")) return null;
  if (name && !hasBar && !body.startsWith("-")) return null;
  const dashes = (body.match(/-/g) ?? []).length;
  if (dashes < 3) return null;
  const trimmed = stripTrailingRepeat(body).text.trimEnd();
  let tabLike = 0;
  for (const ch of trimmed) if (TAB_CHARS.test(ch)) tabLike++;
  if (tabLike / Math.max(1, trimmed.length) < 0.85) return null;
  return { lineIndex, raw, name, bodyStart };
}

function stripTrailingRepeat(body: string): { text: string; times: number | null } {
  const lastBar = body.lastIndexOf("|");
  const tail = body.slice(lastBar + 1);
  const m = /^\s*(?:[xX]\s*(\d+)|(\d+)\s*[xX])\s*$/.exec(tail);
  if (lastBar >= 0 && m) {
    return { text: body.slice(0, lastBar + 1), times: Number(m[1] ?? m[2]) };
  }
  return { text: body, times: null };
}

function repeatLine(raw: string): number | null {
  const m =
    /^\s*\(?\s*(?:repeat|repetir|repete|rep\.?)?\s*(?:[xX]\s*(\d+)|(\d+)\s*[xX]|(\d+)\s*(?:vezes|times))\s*\)?\s*$/i.exec(
      raw,
    );
  return m ? Number(m[1] ?? m[2] ?? m[3]) : null;
}

function sectionLabel(raw: string): string | null {
  const line = raw.trim();
  if (!line) return null;
  if (/^(tuning|afina[cç][aã]o|capo|tom|key|bpm|tempo)\b/i.test(line)) return null;
  const bracket = /^\[([^\]]{1,40})\]$/.exec(line);
  if (bracket) return bracket[1]!.trim();
  if (line.length <= 40 && SECTION_KEYWORDS.test(line)) return line.replace(/[:\s]+$/, "");
  const colon = /^([^|\-:]{1,30}):$/.exec(line);
  if (colon) return colon[1]!.trim();
  return null;
}

function isAnnotationLine(raw: string): boolean {
  if (!raw.trim()) return false;
  if (!/^[\sTPSMtp.\-|_]+$/.test(raw)) return false;
  return /[TPS]/.test(raw);
}

function findBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  let pendingLabel: string | null = null;
  while (i < lines.length) {
    const first = readStringLine(lines[i]!, i);
    if (!first) {
      const label = sectionLabel(lines[i]!);
      if (label !== null && !isAnnotationLine(lines[i]!)) pendingLabel = label;
      i++;
      continue;
    }
    const group: StringLine[] = [first];
    let j = i + 1;
    while (j < lines.length) {
      const next = readStringLine(lines[j]!, j);
      if (!next) break;
      group.push(next);
      j++;
    }
    if (group.length < 4 || group.length > 6) {
      i = j;
      continue;
    }
    const above = i - 1 >= 0 && isAnnotationLine(lines[i - 1]!) ? i - 1 : null;
    const below = j < lines.length && isAnnotationLine(lines[j]!) ? j : null;
    let repeatTimes: number | null = null;
    for (const line of group) {
      const r = stripTrailingRepeat(line.raw.slice(line.bodyStart)).times;
      if (r !== null) repeatTimes = r;
    }
    const after = below !== null ? below + 1 : j;
    if (repeatTimes === null && after < lines.length) repeatTimes = repeatLine(lines[after]!);
    blocks.push({
      lines: group,
      annotationAbove: above,
      annotationBelow: below,
      repeatTimes,
      label: pendingLabel,
    });
    pendingLabel = null;
    i = j;
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Afinação
// ---------------------------------------------------------------------------

function readLegend(lines: string[]): { capitalP?: "pop" | "pull-off"; lowercaseP?: "pop" | "pull-off" } {
  const result: { capitalP?: "pop" | "pull-off"; lowercaseP?: "pop" | "pull-off" } = {};
  for (const line of lines) {
    const m = /(?:^|\s)([Pp])\s*[=:\-]+\s*(pull|pop)/i.exec(line);
    if (!m) continue;
    const meaning = m[2]!.toLowerCase() === "pop" ? "pop" : "pull-off";
    if (m[1] === "P") result.capitalP = meaning;
    else result.lowercaseP = meaning;
  }
  return result;
}

function readHeaderTuning(lines: string[]): string[] | null {
  for (const line of lines) {
    const m = /^\s*(?:tuning|afina[cç][aã]o)\s*[:\-]\s*(.+)$/i.exec(line);
    if (!m) continue;
    const names = m[1]!.match(/[A-G][#b]?/g);
    if (names && names.length >= 4 && names.length <= 6) return names;
  }
  return null;
}

/** Nomes das cordas do bloco, de cima (mais aguda) para baixo (mais grave). */
function blockNames(block: Block, headerTuning: string[] | null): string[] {
  const count = block.lines.length;
  const fallbackLowToHigh =
    headerTuning && headerTuning.length === count ? headerTuning : DEFAULT_TUNINGS[count]!;
  const fallback = [...fallbackLowToHigh].reverse();
  return block.lines.map((l, i) => l.name ?? fallback[i]!);
}

function openStringMidi(namesHighToLow: string[]): (number | null)[] {
  const count = namesHighToLow.length;
  const reference = [...REFERENCE_MIDI[count]!].reverse();
  return namesHighToLow.map((name, i) => {
    const base = PITCH_CLASS[name[0]!.toUpperCase()];
    if (base === undefined) return null;
    const pc = (base + (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0) + 12) % 12;
    const ref = reference[i]!;
    let best = ref - ((ref - pc) % 12 + 12) % 12; // maior altura <= ref com esse nome
    if (ref - best > 6) best += 12;
    return best;
  });
}

// ---------------------------------------------------------------------------
// Leitura de um bloco
// ---------------------------------------------------------------------------

interface BlockResult {
  measures: Measure[];
  unknown: UnknownSymbol[];
}

function parseBlock(
  block: Block,
  lines: string[],
  names: string[],
  midiByLine: (number | null)[],
  firstMeasureIndex: number,
  pRules: ReadRules,
): BlockResult {
  const unknown: UnknownSymbol[] = [];
  const bodies = block.lines.map((l) => ({
    ...l,
    text: l.raw.slice(0, l.bodyStart) + stripTrailingRepeat(l.raw.slice(l.bodyStart)).text,
  }));

  // Barras de compasso: colunas onde a maioria das cordas tem "|".
  const barVotes = new Map<number, number>();
  for (const b of bodies) {
    for (let c = b.bodyStart; c < b.text.length; c++) {
      if (b.text[c] === "|") barVotes.set(c, (barVotes.get(c) ?? 0) + 1);
    }
  }
  const bars = [...barVotes.entries()]
    .filter(([, v]) => v * 2 >= bodies.length)
    .map(([c]) => c)
    .sort((a, b) => a - b);
  const start = Math.min(...bodies.map((b) => b.bodyStart));
  const end = Math.max(...bodies.map((b) => b.text.length));
  const edges = [start - 1, ...bars, end];
  const segments: { from: number; to: number }[] = [];
  for (let k = 0; k + 1 < edges.length; k++) {
    segments.push({ from: edges[k]! + 1, to: edges[k + 1]! });
  }

  // Notas de cada corda, lidas da esquerda para a direita no bloco inteiro.
  const notesByLine: TokenNote[][] = bodies.map((b, lineNo) =>
    tokenizeString(b.text, b.bodyStart, names[lineNo]!, lineNo + 1, midiByLine[lineNo] ?? null, pRules, (symbol, column) => {
      unknown.push({
        symbol,
        measureNumber: firstMeasureIndex + measureIndexAt(segments, column) + 1,
        string: names[lineNo]!,
        line: b.lineIndex + 1,
        column,
      });
    }),
  );

  // Linhas de anotação (PM, T, P, S) acima ou abaixo do bloco.
  const allNotes = notesByLine.flat();
  for (const idx of [block.annotationAbove, block.annotationBelow]) {
    if (idx === null) continue;
    applyAnnotation(lines[idx]!, allNotes, (symbol, column) => {
      unknown.push({
        symbol,
        measureNumber: firstMeasureIndex + measureIndexAt(segments, column) + 1,
        string: null,
        line: idx + 1,
        column,
      });
    });
  }

  // Monta os compassos, pulando segmentos que são só barra dupla ou sinal de repetição.
  const measures: Measure[] = [];
  for (const seg of segments) {
    const content = bodies.map((b) => b.text.slice(seg.from, seg.to)).join("");
    const notesHere = allNotes.filter((n) => n.column >= seg.from && n.column < seg.to);
    const width = seg.to - seg.from;
    if (notesHere.length === 0 && (width <= 2 || !/-/.test(content))) continue;
    const byColumn = new Map<number, TokenNote[]>();
    for (const n of notesHere) {
      const list = byColumn.get(n.column) ?? [];
      list.push(n);
      byColumn.set(n.column, list);
    }
    const events: TabEvent[] = [...byColumn.entries()]
      .sort(([a], [b]) => a - b)
      .map(([column, notes]) => ({
        column,
        position: round((column - seg.from) / Math.max(1, width)),
        notes: notes.sort((a, b) => a.stringNumber - b.stringNumber).map(stripColumn),
      }));
    const measure: Measure = { number: firstMeasureIndex + measures.length + 1, events };
    const before = bodies.map((b) => b.text[seg.from]).filter((c) => c === ":").length;
    const after = bodies.map((b) => b.text[seg.to - 1]).filter((c) => c === ":").length;
    if (before * 2 >= bodies.length) measure.repeatStart = true;
    if (after * 2 >= bodies.length) measure.repeatEnd = { times: null };
    measures.push(measure);
  }

  if (block.repeatTimes !== null && measures.length > 0) {
    measures[0]!.repeatStart = true;
    measures[measures.length - 1]!.repeatEnd = { times: block.repeatTimes };
  }

  return { measures, unknown };
}

function measureIndexAt(segments: { from: number; to: number }[], column: number): number {
  const i = segments.findIndex((s) => column < s.to);
  return i === -1 ? Math.max(0, segments.length - 1) : i;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function stripColumn(n: TokenNote): Note {
  const { column: _column, ...note } = n;
  return note;
}

// ---------------------------------------------------------------------------
// Leitura de uma corda
// ---------------------------------------------------------------------------

function tokenizeString(
  text: string,
  from: number,
  name: string,
  stringNumber: number,
  openMidi: number | null,
  pRules: ReadRules,
  reportUnknown: (symbol: string, column: number) => void,
): TokenNote[] {
  const notes: TokenNote[] = [];
  const st = {
    last: null as TokenNote | null,
    pendingLink: null as { technique: LinkTechnique; column: number; symbol: string } | null,
  };
  /** O caractere anterior encostava na última nota (sem traço no meio). */
  let adjacent = false;
  let pendingSlideIn = false;
  let pendingPrefix: NoteTechnique[] = [];

  const makeNote = (fret: number | null, column: number, techniques: NoteTechnique[]): TokenNote => {
    const note: TokenNote = {
      string: name,
      stringNumber,
      fret,
      midi: fret !== null && openMidi !== null ? openMidi + fret : null,
      techniques: [...pendingPrefix, ...techniques],
      column,
    };
    pendingPrefix = [];
    if (pendingSlideIn) {
      note.techniques.push("slide-in");
      pendingSlideIn = false;
    }
    if (st.pendingLink && st.last) {
      let technique = st.pendingLink.technique;
      if (technique === "slide" && st.last.fret !== null && fret !== null) {
        technique = fret > st.last.fret ? "slide-up" : fret < st.last.fret ? "slide-down" : "slide";
      }
      if (fret !== null) st.last.linkTo = { technique, toFret: fret };
      note.linkedFrom = technique;
    }
    st.pendingLink = null;
    notes.push(note);
    st.last = note;
    adjacent = true;
    return note;
  };

  const startLink = (technique: LinkTechnique, column: number, symbol: string) => {
    const isSlide = technique === "slide" || technique === "slide-up" || technique === "slide-down";
    if (st.last && adjacent) {
      st.pendingLink = { technique, column, symbol };
    } else if (isSlide) {
      pendingSlideIn = true;
    } else {
      reportUnknown(symbol, column);
    }
    adjacent = false;
  };

  let i = from;
  while (i < text.length) {
    const ch = text[i]!;
    const next = text[i + 1] ?? "";

    if (ch === "-" || ch === " " || ch === "." || ch === "_") {
      if (st.pendingLink && st.pendingLink.technique.startsWith("slide") && st.last && !pendingSlideIn) {
        // Slide seguido de traço: sai da nota sem nota de chegada.
        st.last.techniques.push("slide-out");
        st.pendingLink = null;
      } else if (st.pendingLink) {
        reportUnknown(st.pendingLink.symbol, st.pendingLink.column);
        st.pendingLink = null;
      }
      adjacent = false;
      i++;
      continue;
    }
    if (ch === "|" || ch === ":") {
      i++;
      continue;
    }

    if (/\d/.test(ch)) {
      const run = /^\d+/.exec(text.slice(i))![0];
      const frets = splitDigitRun(run, pRules.highFrets);
      if (frets.length > 1 && run.length === frets.length) pRules.onSplit(run);
      let col = i;
      for (const f of frets) {
        makeNote(f.value, col, []);
        col += f.length;
      }
      i += run.length;
      continue;
    }

    if (ch === "(") {
      const m = /^\((\d{1,2})\)/.exec(text.slice(i));
      if (m) {
        makeNote(Number(m[1]), i, ["ghost"]);
        i += m[0].length;
        continue;
      }
      reportUnknown(ch, i);
      i++;
      continue;
    }

    if (ch === "<" || ch === "[") {
      const close = ch === "<" ? ">" : "]";
      const m = new RegExp(`^\\${ch}(\\d{1,2})\\${close}`).exec(text.slice(i));
      if (m) {
        makeNote(Number(m[1]), i, ["natural-harmonic"]);
        i += m[0].length;
        continue;
      }
      reportUnknown(ch, i);
      i++;
      continue;
    }

    if (ch === "x" || ch === "X") {
      makeNote(null, i, ["dead"]);
      i++;
      continue;
    }

    if (ch === "*" && st.last && adjacent) {
      if (!st.last.techniques.includes("natural-harmonic")) st.last.techniques.push("natural-harmonic");
      i++;
      continue;
    }

    if ((ch === "A" || ch === "P") && next === "H" && st.last && adjacent) {
      st.last.techniques.push("artificial-harmonic");
      i += 2;
      continue;
    }

    if (ch === "~") {
      if (st.last && (adjacent || text[i - 1] === "~")) {
        if (!st.last.techniques.includes("vibrato")) st.last.techniques.push("vibrato");
        adjacent = true;
      } else {
        reportUnknown(ch, i);
      }
      i++;
      continue;
    }

    if (ch === "h" || ch === "H") {
      startLink("hammer-on", i, ch);
      i++;
      continue;
    }

    if (ch === "p" || ch === "P") {
      const meaning = ch === "p" ? pRules.lowercaseP : pRules.capitalP;
      if (meaning === "pull-off" && st.last && adjacent) {
        startLink("pull-off", i, ch);
      } else if (/\d/.test(next)) {
        pendingPrefix.push("pop");
        adjacent = false;
      } else if (meaning === "pull-off") {
        startLink("pull-off", i, ch);
      } else {
        reportUnknown(ch, i);
      }
      i++;
      continue;
    }

    if ((ch === "T" || ch === "S") && /\d/.test(next)) {
      pendingPrefix.push("slap");
      adjacent = false;
      i++;
      continue;
    }

    if (ch === "t" && /\d/.test(next)) {
      pendingPrefix.push("tap");
      adjacent = false;
      i++;
      continue;
    }

    if (ch === "/" || ch === "\\" || ch === "s") {
      const technique: LinkTechnique = ch === "/" ? "slide-up" : ch === "\\" ? "slide-down" : "slide";
      startLink(technique, i, ch);
      i++;
      continue;
    }

    if ((ch === "b" || ch === "r") && st.last && adjacent) {
      const technique: NoteTechnique = ch === "b" ? "bend" : "release";
      const target = /^\(?(\d{1,2})\)?/.exec(text.slice(i + 1));
      const lastNote: TokenNote = st.last;
      lastNote.techniques.push(technique);
      if (target) {
        const value = Number(target[1]);
        if (ch === "b") lastNote.bendTo = value;
        else lastNote.releaseTo = value;
        i += 1 + target[0].length;
      } else {
        i++;
      }
      adjacent = true;
      continue;
    }

    reportUnknown(ch, i);
    adjacent = false;
    i++;
  }

  if (st.pendingLink) {
    const dangling: { technique: LinkTechnique; column: number; symbol: string } = st.pendingLink;
    if (dangling.technique.startsWith("slide") && st.last) st.last.techniques.push("slide-out");
    else reportUnknown(dangling.symbol, dangling.column);
  }
  return notes;
}

/**
 * Divide uma sequência de dígitos grudados em casas.
 *
 * Tabs de baixo costumam grudar notas, como "2222" para quatro notas na casa 2 ou "24" para casa 2 e
 * depois 4. Regras:
 * - Dígitos todos iguais (três ou mais) são notas separadas: "2222" vira 2, 2, 2, 2.
 * - Dois dígitos de 10 a 15 são uma casa só.
 * - Dois dígitos de 16 a 24 são uma casa só apenas quando a música usa casas de 10 a 15 em outro
 *   lugar (highFrets). Senão, são duas casas: "24" vira 2 e 4.
 * - Sequências mais longas são lidas da esquerda para a direita com as mesmas regras.
 */
export function splitDigitRun(run: string, highFrets: boolean): { value: number; length: number }[] {
  if (run.length >= 3 && /^(\d)\1+$/.test(run)) {
    return [...run].map((d) => ({ value: Number(d), length: 1 }));
  }
  const out: { value: number; length: number }[] = [];
  let i = 0;
  while (i < run.length) {
    const two = run.slice(i, i + 2);
    const value = Number(two);
    if (two.length === 2 && run[i] !== "0" && value >= 10 && (value <= 15 || (highFrets && value <= 24))) {
      out.push({ value, length: 2 });
      i += 2;
    } else {
      out.push({ value: Number(run[i]), length: 1 });
      i += 1;
    }
  }
  return out;
}

/** A música tem alguma casa de 10 a 15 escrita como dois dígitos sozinhos? */
function hasMidRangeFrets(blocks: Block[]): boolean {
  for (const block of blocks) {
    for (const line of block.lines) {
      for (const m of line.raw.slice(line.bodyStart).matchAll(/(?<!\d)(\d\d)(?!\d)/g)) {
        const v = Number(m[1]);
        if (v >= 10 && v <= 15) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Linhas de anotação
// ---------------------------------------------------------------------------

function applyAnnotation(
  raw: string,
  notes: TokenNote[],
  reportUnknown: (symbol: string, column: number) => void,
): void {
  let line = raw;
  // Palm mute: "PM" ou "P.M." seguido de traços ou pontos até um espaço.
  const pm = /P\.?M\.?[-._|]*/g;
  let m: RegExpExecArray | null;
  while ((m = pm.exec(raw))) {
    const from = m.index;
    const to = m.index + m[0].length;
    for (const n of notes) {
      if (n.column >= from && n.column < to && !n.techniques.includes("palm-mute")) {
        n.techniques.push("palm-mute");
      }
    }
    line = line.slice(0, from) + " ".repeat(to - from) + line.slice(to);
  }
  for (let c = 0; c < line.length; c++) {
    const ch = line[c]!;
    if (ch !== "T" && ch !== "S" && ch !== "P") continue;
    const technique: NoteTechnique = ch === "P" ? "pop" : "slap";
    const targets = notes.filter((n) => n.column === c);
    const near = targets.length > 0 ? targets : notes.filter((n) => Math.abs(n.column - c) === 1);
    if (near.length === 0) {
      reportUnknown(ch, c);
      continue;
    }
    for (const n of near) if (!n.techniques.includes(technique)) n.techniques.push(technique);
  }
}
