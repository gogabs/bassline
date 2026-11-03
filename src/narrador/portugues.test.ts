import { describe, expect, it } from "vitest";
import { parseTab } from "../parser";
import { narradorPortugues, obterNarrador, OPCOES_PADRAO, type OpcoesNarracao } from "./index";

const narrar = (tab: string[], opcoes: Partial<OpcoesNarracao> = {}) =>
  narradorPortugues.narrar(parseTab(tab.join("\n")), { ...OPCOES_PADRAO, ...opcoes });

const textos = (tab: string[], opcoes: Partial<OpcoesNarracao> = {}) =>
  narrar(tab, opcoes).secoes.flatMap((s) => s.blocos.map((b) => [b.titulo, ...b.itens.map((i) => i.texto)]));

const RIFF = [
  "G|----------------|----------------|",
  "D|----------------|------------5-7-|",
  "A|-----------3h5--|--3-3-3-3-------|",
  "E|-3-3-3-3--------|----------------|",
];

describe("narrador em português", () => {
  it("lê corda e casa, junta repetições e o hammer-on", () => {
    expect(textos(RIFF)).toEqual([
      ["Compasso 1", "E3, 4 vezes", "A3, hammer para 5"],
      ["Compasso 2", "A3, 4 vezes", "D5", "D7"],
    ]);
  });

  it("lê pelo nome da nota ou pelos dois", () => {
    expect(textos(RIFF, { leitura: "nome" })[0]).toEqual(["Compasso 1", "Sol, 4 vezes", "Dó, hammer para Ré"]);
    expect(textos(RIFF, { leitura: "ambos" })[0]).toEqual(["Compasso 1", "Sol, E3, 4 vezes", "Dó, A3, hammer para Ré, casa 5"]);
    expect(textos(RIFF, { leitura: "nome", nomes: "en" })[0]).toEqual(["Compasso 1", "G, 4 vezes", "C, hammer para D"]);
  });

  it("pode ler nota por nota, sem juntar repetições", () => {
    expect(textos(RIFF, { juntarRepetidas: false })[0]!.slice(0, 3)).toEqual(["Compasso 1", "E3", "E3"]);
  });

  it("junta compassos iguais seguidos", () => {
    const tab = ["G|--------|--------|--------|", "D|--------|--------|--------|", "A|--------|--------|--5-----|", "E|-3-3----|-3-3----|--------|"];
    expect(textos(tab)).toEqual([
      ["Compassos 1 a 2, iguais", "E3, 2 vezes"],
      ["Compasso 3", "A5"],
    ]);
    expect(textos(tab, { juntarCompassos: false })).toHaveLength(3);
  });

  it("fala técnicas em palavras", () => {
    const tab = ["G|-----7~--|--(5)----|", "D|-5/7-----|--x--9b11|", "A|---------|---------|", "E|-0-------|-T3------|"];
    expect(textos(tab)).toEqual([
      ["Compasso 1", "juntas, E0; D5, slide subindo até 7", "G7, com vibrato"],
      ["Compasso 2", "juntas, slap E3; nota morta na corda D; ghost G5", "D9, bend até 11"],
    ]);
  });

  it("fala as técnicas só na primeira vez, se pedido", () => {
    const tab = ["G|---------|", "D|---------|", "A|-3h5-3h5-|", "E|---------|"];
    expect(textos(tab, { tecnicas: "primeira" })[0]).toEqual(["Compasso 1", "A3, hammer para 5", "A3", "A5"]);
    expect(textos(tab, { tecnicas: "nunca" })[0]).toEqual(["Compasso 1", "A3", "A5", "A3", "A5"]);
  });

  it("usa os nomes das seções e faz um resumo", () => {
    const n = narrar(["[Intro]", ...RIFF, "", "[Refrão]", ...RIFF]);
    expect(n.secoes.map((s) => s.titulo)).toEqual(["Intro", "Refrão"]);
    expect(n.secoes[1]!.blocos[0]!.titulo).toBe("Compasso 3");
    expect(n.resumo).toBe("Afinação padrão, 4 cordas. 4 compassos. Tem hammer-on.");
  });

  it("avisa símbolos desconhecidos com o compasso", () => {
    const n = narrar(["G|--------|", "D|--------|", "A|--5*%---|", "E|--------|"]);
    expect(n.avisos.length).toBeGreaterThan(0);
    expect(n.avisos[0]!.compasso).toBe(1);
    expect(n.avisos[0]!.texto).toMatch(/^Símbolo desconhecido/);
  });

  it("o registro devolve o narrador padrão quando o id não existe", () => {
    expect(obterNarrador("nao-existe").id).toBe("pt-br");
  });
});

describe("comentários da tab", () => {
  it("põe o comentário no bloco seguinte e não junta compassos separados por comentário", () => {
    const tab = ["G|----|", "D|----|", "A|-3--|", "E|----|", "toque mais leve aqui", "G|----|", "D|----|", "A|-3--|", "E|----|", "", "fim, repete 2 vezes"];
    const blocos = narrar(tab).secoes[0]!.blocos;
    expect(blocos.map((b) => b.titulo)).toEqual(["Compasso 1", "Compasso 2"]);
    expect(blocos[0]!.comentarios).toEqual([]);
    expect(blocos[1]!.comentarios).toEqual(["toque mais leve aqui"]);
    expect(blocos[1]!.comentariosDepois).toEqual(["fim, repete 2 vezes"]);
  });
});
