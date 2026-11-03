import { describe, expect, it } from "vitest";
import { fonteDoLink, pareceLink } from "./index";
import { cifraClub } from "./cifraclub";
import { ultimateGuitar } from "./ultimateguitar";

// Páginas de exemplo montadas à mão, imitando a estrutura dos sites.
// Precisam ser trocadas por páginas reais salvas assim que der para baixá-las.

describe("fontes de tab por link", () => {
  it("reconhece links dos sites aceitos e recusa os outros", () => {
    expect(fonteDoLink("https://www.cifraclub.com.br/paramore/emergency/tabs-baixo/")?.fonte.id).toBe("cifraclub");
    expect(fonteDoLink("https://tabs.ultimate-guitar.com/tab/paramore/pressure-bass-532174")?.fonte.id).toBe("ultimate-guitar");
    expect(fonteDoLink("https://exemplo.com/tab")).toBeUndefined();
    expect(fonteDoLink("http://www.cifraclub.com.br/x")).toBeUndefined();
    expect(fonteDoLink("http://localhost:8787/api")).toBeUndefined();
  });

  it("diferencia link de texto colado", () => {
    expect(pareceLink("  https://www.cifraclub.com.br/a/b/  ")).toBe(true);
    expect(pareceLink("G|---3---|\nD|-------|")).toBe(false);
  });

  it("extrai a tab do Cifra Club", () => {
    const html = `<html><head><title>Emergency - Paramore - Cifra Club</title></head><body>
      <nav><h2>Menu principal</h2></nav>
      <h1 class="t1">Emergency</h1><h2 class="t3"><a href="/paramore/">Paramore</a></h2>
      <div class="cifra_cnt"><pre>\u200B[Intro]
<span class="tablatura"><span class="cnt">\u200BG|-------|
D|-------|
A|--3&amp;---|
E|-0-----|</span></span></pre></div></body></html>`;
    const tab = cifraClub.extrair(html, new URL("https://www.cifraclub.com.br/paramore/emergency/tabs-baixo/"));
    expect(tab.titulo).toBe("Paramore, Emergency");
    expect(tab.texto).toBe("[Intro]\nG|-------|\nD|-------|\nA|--3&---|\nE|-0-----|");
  });

  it("extrai a tab do Ultimate Guitar", () => {
    const dados = {
      store: { page: { data: { tab: { song_name: "Pressure", artist_name: "Paramore" }, tab_view: { wiki_tab: { content: "[Verse]\r\n[tab]G|-----|\r\nD|-----|\r\nA|--5--|\r\nE|-3---|[/tab]" } } } } },
    };
    const atributo = JSON.stringify(dados).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    const html = `<html><body><div class="js-store" data-content="${atributo}"></div></body></html>`;
    const tab = ultimateGuitar.extrair(html, new URL("https://tabs.ultimate-guitar.com/tab/x"));
    expect(tab.titulo).toBe("Paramore, Pressure");
    expect(tab.texto).toBe("[Verse]\nG|-----|\nD|-----|\nA|--5--|\nE|-3---|");
  });
});
