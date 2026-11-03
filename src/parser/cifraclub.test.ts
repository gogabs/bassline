import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTab } from "./index";
import type { Song } from "./types";

/** Tab real do Cifra Club, com comentários espalhados e linhas com e sem "|". */
const EXEMPLO = readFileSync(new URL("./exemplos/cifraclub-comentarios.txt", import.meta.url), "utf8");

const resumo = (song: Song) =>
  song.sections.map((s) => ({
    label: s.label,
    measures: s.measures.map((m) => ({
      notes: m.events.flatMap((e) => e.notes.map((n) => `${n.string}${n.fret}`)).join(" "),
      comments: m.comments,
      commentsAfter: m.commentsAfter,
    })),
  }));

describe("tabs do Cifra Club", () => {
  const limpa = parseTab(EXEMPLO);

  it("lê seções, notas e comentários do exemplo", () => {
    const r = resumo(limpa);
    expect(r.map((s) => s.label)).toEqual(["Introdução verso e refrões", "Ponte"]);
    expect(r[0]!.measures).toHaveLength(2);
    expect(r[1]!.measures).toHaveLength(2);
    expect(r[0]!.measures[0]!.notes).toBe(
      ["10", "5", "7", "3"].map((f) => Array(8).fill(`E${f}`).join(" ")).join(" "),
    );
    expect(r[0]!.measures[0]!.comments).toBeUndefined();
    expect(r[0]!.measures[1]!.comments).toEqual(["seria bom variar as vezes"]);
    expect(r[1]!.measures[0]!.notes).toBe("A5 A5 A5 A5 A5 G7 A5 A5 A5 A5 A5 G7");
    expect(r[1]!.measures[1]!.comments).toEqual([
      "ouvindo a musica vai saber quantas vezes,ai logo quando entrar o teclado ja volta o acompanhamento abaixo.",
    ]);
    expect(limpa.unknownSymbols).toEqual([]);
    expect(limpa.warnings).toEqual([]);
  });

  it.each([
    ["espaço não separável", " "],
    ["BOM", "﻿"],
    ["espaço de largura zero", "​"],
    ["marca de direção", "‎"],
    ["espaço comum + não separável", "  "],
    ["espaço largo", " "],
    ["caractere de substituição", "�"],
  ])("ignora %s no começo das linhas", (_nome, sujeira) => {
    const suja = EXEMPLO.split("\n")
      .map((l) => (l ? sujeira + l : l))
      .join("\r\n");
    expect(resumo(parseTab(suja))).toEqual(resumo(limpa));
  });

  it("ignora sujeira só em algumas linhas do bloco", () => {
    const suja = EXEMPLO.split("\n")
      .map((l, i) => (i % 2 === 0 && l ? " " + l : l))
      .join("\n");
    expect(resumo(parseTab(suja))).toEqual(resumo(limpa));
  });

  it("alinha um bloco em que uma linha tem um espaço a mais no começo", () => {
    const song = parseTab(["G|---|---|", " D|---|---|", "A|-3-|-5-|", "E|---|---|"].join("\n"));
    expect(song.sections[0]!.measures.map((m) => m.events.length)).toEqual([1, 1]);
  });

  it("guarda comentários do fim da tab no último compasso", () => {
    const song = parseTab(["G|----|", "D|----|", "A|-3--|", "E|----|", "", "repete tudo até o fim"].join("\n"));
    expect(song.sections[0]!.measures[0]!.commentsAfter).toEqual(["repete tudo até o fim"]);
  });

  it("não confunde cifras, afinação, repetição e anotações com comentário", () => {
    const song = parseTab(
      ["Afinação: E A D G", "Am   G   F", "T   P", "G|----|", "D|----|", "A|-3--|", "E|-3--|", "x4"].join("\n"),
    );
    expect(song.sections[0]!.measures[0]!.comments).toBeUndefined();
    expect(song.sections[0]!.measures[0]!.commentsAfter).toBeUndefined();
  });
});
