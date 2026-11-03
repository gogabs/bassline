import { describe, expect, it } from "vitest";
import { ehIdDoYoutube, lerBusca } from "./backing";

describe("lerBusca", () => {
  it("lê a saída do yt-dlp", () => {
    const saida = "mgJ8BZi3vTA\tParamore: Emergency [OFFICIAL VIDEO]\tParamore\t239\r\nabcdefghijk\tAo vivo\tNA\tNA\nlixo\n";
    expect(lerBusca(saida)).toEqual([
      { id: "mgJ8BZi3vTA", titulo: "Paramore: Emergency [OFFICIAL VIDEO]", canal: "Paramore", duracao: 239 },
      { id: "abcdefghijk", titulo: "Ao vivo", canal: "", duracao: null },
    ]);
  });

  it("só aceita ids do YouTube", () => {
    expect(ehIdDoYoutube("mgJ8BZi3vTA")).toBe(true);
    expect(ehIdDoYoutube("--exec=rm -rf")).toBe(false);
    expect(ehIdDoYoutube("mgJ8BZi3vTA&x")).toBe(false);
  });
});
