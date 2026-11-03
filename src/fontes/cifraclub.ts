import type { Fonte } from "./tipos";
import { textoSemTags, tituloDaPagina } from "./html";

/**
 * Cifra Club. A tab fica em blocos <pre> dentro da área da cifra.
 * O título vem do h1 (música) e do h2 (artista).
 */
export const cifraClub: Fonte = {
  id: "cifraclub",
  nome: "Cifra Club",
  dominios: ["cifraclub.com.br", "www.cifraclub.com.br", "m.cifraclub.com.br"],
  extrair(html) {
    const blocos = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) => textoSemTags(m[1]!));
    const musica = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    const artista = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
    const titulo =
      musica && artista
        ? `${textoSemTags(artista[1]!).trim()}, ${textoSemTags(musica[1]!).trim()}`
        : (tituloDaPagina(html)?.split(" - Cifra Club")[0] ?? null);
    return { titulo, texto: blocos.join("\n\n").trim() };
  },
};
