import type { LinkTechnique, Measure, Note, NoteTechnique, Section, Song } from "../parser";
import { nomeDaNota } from "./notas";
import type { AvisoNarrado, BlocoNarrado, ItemNarrado, Narracao, Narrador, OpcoesNarracao, SecaoNarrada } from "./tipos";

/** Narrador padrão, em português, com frases curtas. */
export const narradorPortugues: Narrador = {
  id: "pt-br",
  nome: "Português",
  narrar(song, opcoes) {
    return {
      resumo: resumo(song),
      avisos: avisos(song),
      secoes: secoes(song, opcoes),
    };
  },
};

// ---------- Resumo e avisos ----------

const AFINACOES_PADRAO = ["E A D G", "B E A D G", "B E A D G C"];

const NOMES_TECNICAS: Record<NoteTechnique | LinkTechnique, string> = {
  ghost: "ghost note",
  dead: "nota morta",
  vibrato: "vibrato",
  "natural-harmonic": "harmônico",
  "artificial-harmonic": "harmônico artificial",
  slap: "slap",
  pop: "pop",
  tap: "tapping",
  "palm-mute": "palm mute",
  "slide-in": "slide",
  "slide-out": "slide",
  bend: "bend",
  release: "release",
  "hammer-on": "hammer-on",
  "pull-off": "pull-off",
  "slide-up": "slide",
  "slide-down": "slide",
  slide: "slide",
};

function todosCompassos(song: Song): Measure[] {
  return song.sections.flatMap((s) => s.measures);
}

function resumo(song: Song): string {
  const afinacao = song.tuning.join(" ");
  const partes: string[] = [];
  partes.push(
    AFINACOES_PADRAO.includes(afinacao)
      ? `Afinação padrão, ${song.stringCount} cordas.`
      : `Afinação ${afinacao}, ${song.stringCount} cordas.`,
  );
  const total = todosCompassos(song).length;
  partes.push(total === 1 ? "1 compasso." : `${total} compassos.`);

  const tecnicas: string[] = [];
  for (const m of todosCompassos(song))
    for (const e of m.events)
      for (const n of e.notes) {
        for (const t of n.techniques) tecnicas.push(NOMES_TECNICAS[t]);
        if (n.linkTo) tecnicas.push(NOMES_TECNICAS[n.linkTo.technique]);
      }
  const unicas = [...new Set(tecnicas)];
  if (unicas.length > 0) partes.push(`Tem ${listaEmPortugues(unicas)}.`);
  return partes.join(" ");
}

const NOMES_SIMBOLOS: Record<string, string> = {
  "*": "asterisco",
  "/": "barra",
  "\\": "barra invertida",
  "~": "til",
  "^": "circunflexo",
  "=": "igual",
  "+": "mais",
  ".": "ponto",
  ",": "vírgula",
  ":": "dois pontos",
  "!": "exclamação",
  "?": "interrogação",
  "#": "sustenido",
  "&": "e comercial",
  "%": "porcento",
  "<": "menor que",
  ">": "maior que",
  "(": "abre parênteses",
  ")": "fecha parênteses",
  "[": "abre colchete",
  "]": "fecha colchete",
};

export function nomeDoSimbolo(simbolo: string): string {
  if (simbolo.length === 1) return NOMES_SIMBOLOS[simbolo] ?? `"${simbolo}"`;
  return `"${[...simbolo].map((c) => NOMES_SIMBOLOS[c] ?? c).join(" ")}"`;
}

function avisos(song: Song): AvisoNarrado[] {
  const lista: AvisoNarrado[] = song.unknownSymbols.map((u) => ({
    texto: `Símbolo desconhecido: ${nomeDoSimbolo(u.symbol)}, compasso ${u.measureNumber}${u.string ? `, corda ${u.string}` : ""}.`,
    compasso: u.measureNumber,
  }));
  for (const w of song.warnings) lista.push({ texto: w, compasso: null });
  return lista;
}

// ---------- Seções e blocos ----------

function secoes(song: Song, opcoes: OpcoesNarracao): SecaoNarrada[] {
  let semNome = 0;
  return song.sections.map((secao) => {
    const titulo = secao.label ?? (song.sections.length === 1 ? "Tab" : `Parte ${++semNome}`);
    return { titulo, semNome: secao.label === null, blocos: blocos(secao, song, opcoes) };
  });
}

function assinaturaCompasso(m: Measure): string {
  return JSON.stringify(
    m.events.map((e) => [
      Math.round(e.position * 100),
      e.notes.map((n) => [n.stringNumber, n.fret, [...n.techniques].sort(), n.linkTo ?? null, n.bendTo ?? null, n.releaseTo ?? null]),
    ]),
  );
}

function blocos(secao: Section, song: Song, opcoes: OpcoesNarracao): BlocoNarrado[] {
  const grupos: Measure[][] = [];
  for (const m of secao.measures) {
    const ultimo = grupos[grupos.length - 1];
    const anterior = ultimo?.[ultimo.length - 1];
    const podeJuntar =
      opcoes.juntarCompassos &&
      anterior !== undefined &&
      m.events.length > 0 &&
      !m.comments?.length &&
      !anterior.commentsAfter?.length &&
      !m.repeatStart &&
      !anterior.repeatEnd &&
      assinaturaCompasso(anterior) === assinaturaCompasso(m);
    if (podeJuntar) ultimo!.push(m);
    else grupos.push([m]);
  }

  return grupos.map((compassos) => {
    const primeiro = compassos[0]!;
    const ultimo = compassos[compassos.length - 1]!;
    let titulo =
      compassos.length === 1
        ? `Compasso ${primeiro.number}`
        : `Compassos ${primeiro.number} a ${ultimo.number}, iguais`;
    if (primeiro.events.length === 0) titulo += ", vazio";
    if (primeiro.repeatStart) titulo += ", início da repetição";
    if (ultimo.repeatEnd)
      titulo += ultimo.repeatEnd.times ? `, fim da repetição, toca ${ultimo.repeatEnd.times} vezes` : ", fim da repetição";
    return {
      titulo,
      rotuloTocar: `Tocar compasso ${primeiro.number}`,
      compassos,
      comentarios: primeiro.comments ?? [],
      comentariosDepois: ultimo.commentsAfter ?? [],
      itens: itensDoCompasso(primeiro, song, opcoes),
    };
  });
}

// ---------- Itens (símbolos) ----------

function itensDoCompasso(m: Measure, song: Song, opcoes: OpcoesNarracao): ItemNarrado[] {
  const ditas = new Set<string>();
  const falarTecnica = (t: string): boolean => {
    if (opcoes.tecnicas === "nunca") return false;
    if (opcoes.tecnicas === "sempre") return true;
    if (ditas.has(t)) return false;
    ditas.add(t);
    return true;
  };

  const brutos: ItemNarrado[] = [];
  const eventos = m.events;
  for (let i = 0; i < eventos.length; i++) {
    const evento = eventos[i]!;
    const proximo = eventos[i + 1];
    const notas = [...evento.notes].sort((x, y) => y.stringNumber - x.stringNumber);
    let falouLigacao = false;
    const partes = notas.map((n) => {
      let texto = textoNota(n, opcoes, falarTecnica);
      if (n.linkTo && falarTecnica(n.linkTo.technique)) {
        const chegada = proximo?.notes.find((c) => c.stringNumber === n.stringNumber && c.linkedFrom);
        texto += `, ${textoLigacao(n, chegada, opcoes)}`;
        if (chegada) texto += sufixosChegada(chegada, falarTecnica);
        falouLigacao = true;
      }
      return texto;
    });
    const texto = partes.length === 1 ? partes[0]! : `juntas, ${partes.join("; ")}`;
    // A nota de chegada de um hammer, pull ou slide já foi dita ("A3, hammer para 5"),
    // então o evento de chegada entra no mesmo item quando só tem notas de chegada.
    if (falouLigacao && proximo && proximo.notes.every((c) => c.linkedFrom)) {
      brutos.push({ texto, eventos: [evento, proximo] });
      i++;
    } else brutos.push({ texto, eventos: [evento] });
  }
  return opcoes.juntarRepetidas ? juntarRepetidos(brutos) : brutos;
}

function juntarRepetidos(itens: ItemNarrado[]): ItemNarrado[] {
  const saida: { texto: string; eventos: ItemNarrado["eventos"]; vezes: number }[] = [];
  for (const item of itens) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.texto === item.texto) {
      ultimo.vezes++;
      ultimo.eventos = [...ultimo.eventos, ...item.eventos];
    } else saida.push({ ...item, vezes: 1 });
  }
  return saida.map((s) => ({ texto: s.vezes > 1 ? `${s.texto}, ${s.vezes} vezes` : s.texto, eventos: s.eventos }));
}

function base(n: Note, opcoes: OpcoesNarracao): string {
  if (n.fret === null) return opcoes.leitura === "nome" ? "nota morta" : `nota morta na corda ${n.string}`;
  const posicao = `${n.string}${n.fret}`;
  if (opcoes.leitura === "posicao" || n.midi === null) return posicao;
  const nome = nomeDaNota(n.midi, opcoes.nomes, opcoes.acidentes);
  return opcoes.leitura === "nome" ? nome : `${nome}, ${posicao}`;
}

function textoNota(n: Note, opcoes: OpcoesNarracao, falar: (t: string) => boolean): string {
  const t = new Set(n.techniques);
  let texto = base(n, opcoes);
  if (t.has("dead")) return texto;

  const prefixos: string[] = [];
  if (t.has("slide-in") && falar("slide-in")) prefixos.push("slide de entrada");
  if (t.has("slap") && falar("slap")) prefixos.push("slap");
  if (t.has("pop") && falar("pop")) prefixos.push("pop");
  if (t.has("tap") && falar("tap")) prefixos.push("tapping");
  if (t.has("natural-harmonic") && falar("natural-harmonic")) prefixos.push("harmônico");
  if (t.has("artificial-harmonic") && falar("artificial-harmonic")) prefixos.push("harmônico artificial");
  if (t.has("ghost") && falar("ghost")) texto = `ghost ${texto}`;
  if (prefixos.length) texto = `${prefixos.join(" ")} ${texto}`;

  const sufixos: string[] = [];
  if (t.has("bend") && falar("bend")) sufixos.push(n.bendTo !== undefined ? `bend até ${alvo(n, n.bendTo, opcoes)}` : "bend");
  if (t.has("release") && falar("release"))
    sufixos.push(n.releaseTo !== undefined ? `release até ${alvo(n, n.releaseTo, opcoes)}` : "release");
  if (t.has("vibrato") && falar("vibrato")) sufixos.push("com vibrato");
  if (t.has("palm-mute") && falar("palm-mute")) sufixos.push("palm mute");
  if (t.has("slide-out") && falar("slide-out")) sufixos.push("slide de saída");
  if (sufixos.length) texto = `${texto}, ${sufixos.join(", ")}`;
  return texto;
}

/** Sufixos da nota de chegada de uma ligação, como vibrato, sem repetir a nota. */
function sufixosChegada(chegada: Note, falar: (t: string) => boolean): string {
  const s: string[] = [];
  if (chegada.techniques.includes("vibrato") && falar("vibrato")) s.push("com vibrato");
  if (chegada.techniques.includes("slide-out") && falar("slide-out")) s.push("slide de saída");
  return s.length ? `, ${s.join(", ")}` : "";
}

/** Alvo de bend, release ou ligação: casa no modo posição, nome no modo nome. */
function alvo(n: Note, casa: number, opcoes: OpcoesNarracao): string {
  if (opcoes.leitura === "posicao" || n.midi === null || n.fret === null) return String(casa);
  const nome = nomeDaNota(n.midi + (casa - n.fret), opcoes.nomes, opcoes.acidentes);
  return opcoes.leitura === "nome" ? nome : `${nome}, casa ${casa}`;
}

function textoLigacao(n: Note, chegada: Note | undefined, opcoes: OpcoesNarracao): string {
  const link = n.linkTo!;
  const destino = alvo(n, chegada?.fret ?? link.toFret, opcoes);
  switch (link.technique) {
    case "hammer-on":
      return `hammer para ${destino}`;
    case "pull-off":
      return `pull para ${destino}`;
    case "slide-up":
      return `slide subindo até ${destino}`;
    case "slide-down":
      return `slide descendo até ${destino}`;
    default:
      return `slide até ${destino}`;
  }
}

function listaEmPortugues(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}
