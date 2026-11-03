import { describe, expect, it } from "vitest";
import { parseTab } from "./index";
import type { Note, Song } from "./types";

const notes = (song: Song, measure: number): Note[] =>
  song.sections.flatMap((s) => s.measures).find((m) => m.number === measure)!.events.flatMap((e) => e.notes);

const short = (n: Note) => `${n.string}${n.fret ?? "x"}`;

describe("parseTab", () => {
  it("lê um riff simples em ordem, compasso por compasso", () => {
    const song = parseTab(
      [
        "G|----------------|----------------|",
        "D|----------------|------------5-7-|",
        "A|-----------3-5--|--3-3-3-3-------|",
        "E|-3-3-3-3--------|----------------|",
      ].join("\n"),
    );
    expect(song.tuning).toEqual(["E", "A", "D", "G"]);
    expect(song.stringCount).toBe(4);
    expect(song.sections).toHaveLength(1);
    expect(song.sections[0]!.measures).toHaveLength(2);
    expect(notes(song, 1).map(short)).toEqual(["E3", "E3", "E3", "E3", "A3", "A5"]);
    expect(notes(song, 2).map(short)).toEqual(["A3", "A3", "A3", "A3", "D5", "D7"]);
    expect(notes(song, 1)[0]!.midi).toBe(31); // Sol
    expect(song.unknownSymbols).toEqual([]);
  });

  it("calcula posição aproximada dentro do compasso", () => {
    const song = parseTab(["G|--------|", "D|--------|", "A|--------|", "E|0---0---|"].join("\n"));
    const events = song.sections[0]!.measures[0]!.events;
    expect(events.map((e) => e.position)).toEqual([0, 0.5]);
  });

  it("agrupa notas na mesma coluna como um evento só", () => {
    const song = parseTab(["G|--------|", "D|--7-----|", "A|--5-----|", "E|--------|"].join("\n"));
    const events = song.sections[0]!.measures[0]!.events;
    expect(events).toHaveLength(1);
    expect(events[0]!.notes.map(short)).toEqual(["D7", "A5"]);
  });

  it("lê casas de dois dígitos", () => {
    const song = parseTab(["G|--12--|", "D|------|", "A|------|", "E|------|"].join("\n"));
    expect(notes(song, 1).map(short)).toEqual(["G12"]);
  });

  it("reconhece hammer-on, pull-off e slides com direção", () => {
    const song = parseTab(
      ["G|-------------|", "D|-------------|", "A|-3h5--5p3----|", "E|-3/5--7\\5-7s5|"].join("\n"),
    );
    const all = notes(song, 1);
    const a3 = all.find((n) => n.string === "A" && n.fret === 3 && n.linkTo)!;
    expect(a3.linkTo).toEqual({ technique: "hammer-on", toFret: 5 });
    const a5 = all.find((n) => n.string === "A" && n.fret === 5 && n.linkTo)!;
    expect(a5.linkTo).toEqual({ technique: "pull-off", toFret: 3 });
    const e = all.filter((n) => n.string === "E");
    expect(e[0]!.linkTo).toEqual({ technique: "slide-up", toFret: 5 });
    expect(e[1]!.linkedFrom).toBe("slide-up");
    expect(e[2]!.linkTo).toEqual({ technique: "slide-down", toFret: 5 });
    expect(e[4]!.linkTo).toEqual({ technique: "slide-down", toFret: 5 });
  });

  it("reconhece slide de entrada e de saída", () => {
    const song = parseTab(["G|----------|", "D|----------|", "A|--/5--7\\--|", "E|----------|"].join("\n"));
    const [first, second] = notes(song, 1);
    expect(first!.techniques).toContain("slide-in");
    expect(second!.techniques).toContain("slide-out");
  });

  it("reconhece ghost, nota morta, harmônico, vibrato, bend e release", () => {
    const song = parseTab(
      ["G|--<12>---7b9r7--|", "D|--5~~----------|", "A|--(3)--x-------|", "E|--------5*-----|"].join("\n"),
    );
    const all = notes(song, 1);
    expect(all.find((n) => n.string === "G" && n.fret === 12)!.techniques).toEqual(["natural-harmonic"]);
    const bend = all.find((n) => n.string === "G" && n.fret === 7)!;
    expect(bend.techniques).toEqual(["bend", "release"]);
    expect(bend.bendTo).toBe(9);
    expect(bend.releaseTo).toBe(7);
    expect(all.find((n) => n.string === "D")!.techniques).toEqual(["vibrato"]);
    expect(all.find((n) => n.string === "A" && n.fret === 3)!.techniques).toEqual(["ghost"]);
    expect(all.find((n) => n.string === "A" && n.fret === null)!.techniques).toEqual(["dead"]);
    expect(all.find((n) => n.string === "E")!.techniques).toEqual(["natural-harmonic"]);
    expect(song.unknownSymbols).toEqual([]);
  });

  it("reconhece slap e pop na própria linha e na linha de anotação", () => {
    const inline = parseTab(["G|------P7--|", "D|----------|", "A|----------|", "E|--T5------|"].join("\n"));
    expect(notes(inline, 1).map((n) => n.techniques)).toEqual([["slap"], ["pop"]]);

    const annotated = parseTab(
      ["     T   P", "G|-------7--|", "D|----------|", "A|----------|", "E|---5------|"].join("\n"),
    );
    const byString = notes(annotated, 1);
    expect(byString.find((n) => n.string === "E")!.techniques).toEqual(["slap"]);
    expect(byString.find((n) => n.string === "G")!.techniques).toEqual(["pop"]);
  });

  it("aplica palm mute a um trecho", () => {
    const song = parseTab(
      ["  PM-----     ", "G|------------|", "D|------------|", "A|------------|", "E|-3-3-3---5--|"].join("\n"),
    );
    const e = notes(song, 1);
    expect(e.slice(0, 3).every((n) => n.techniques.includes("palm-mute"))).toBe(true);
    expect(e[3]!.techniques).not.toContain("palm-mute");
  });

  it("segue a legenda da tab quando P maiúsculo é pull-off", () => {
    const song = parseTab(
      ["P = pull-off", "", "G|--------|", "D|--------|", "A|--5P3---|", "E|--------|"].join("\n"),
    );
    expect(notes(song, 1)[0]!.linkTo).toEqual({ technique: "pull-off", toFret: 3 });
  });

  it("separa seções pelos rótulos e numera compassos na música inteira", () => {
    const song = parseTab(
      [
        "[Intro]",
        "G|-----|-----|",
        "D|-----|-----|",
        "A|-----|-----|",
        "E|--0--|--3--|",
        "",
        "Refrão:",
        "G|-----|",
        "D|-----|",
        "A|--5--|",
        "E|-----|",
      ].join("\n"),
    );
    expect(song.sections.map((s) => s.label)).toEqual(["Intro", "Refrão"]);
    expect(song.sections[1]!.measures[0]!.number).toBe(3);
  });

  it("reconhece repetições escritas como x4", () => {
    const song = parseTab(["G|-----|-----|", "D|-----|-----|", "A|-----|-----|", "E|--0--|--3--| x4"].join("\n"));
    const [first, last] = song.sections[0]!.measures;
    expect(first!.repeatStart).toBe(true);
    expect(last!.repeatEnd).toEqual({ times: 4 });

    const below = parseTab(["G|-----|", "D|-----|", "A|-----|", "E|--0--|", "(x2)"].join("\n"));
    expect(below.sections[0]!.measures[0]!.repeatEnd).toEqual({ times: 2 });
  });

  it("lê baixo de 5 cordas e afinação drop", () => {
    const five = parseTab(["G|----|", "D|----|", "A|----|", "E|----|", "B|-0--|"].join("\n"));
    expect(five.tuning).toEqual(["B", "E", "A", "D", "G"]);
    expect(notes(five, 1)[0]!.midi).toBe(23);

    const drop = parseTab(["G|----|", "D|----|", "A|----|", "D|-0--|"].join("\n"));
    expect(drop.tuning).toEqual(["D", "A", "D", "G"]);
    expect(notes(drop, 1)[0]!.midi).toBe(26);
  });

  it("ignora texto que não é tab e avisa sobre símbolos desconhecidos", () => {
    const song = parseTab(
      [
        "Música de exemplo",
        "Afinação padrão",
        "G|--------|",
        "D|--------|",
        "A|--3--?--|",
        "E|--------|",
        "letra qualquer aqui",
      ].join("\n"),
    );
    expect(notes(song, 1).map(short)).toEqual(["A3"]);
    expect(song.unknownSymbols).toEqual([{ symbol: "?", measureNumber: 1, string: "A", line: 5, column: 7 }]);
  });
});
