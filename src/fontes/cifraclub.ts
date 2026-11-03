import type { Fonte } from "./tipos";
import { textoSemTags, tituloDaPagina } from "./html";

/**
 * Cifra Club. A tab fica em blocos <pre> dentro da área da cifra.
 * O título vem do h1 (música) e do <title> (artista).
 */
export const cifraClub: Fonte = {
  id: "cifraclub",
  nome: "Cifra Club",
  dominios: ["cifraclub.com.br", "www.cifraclub.com.br", "m.cifraclub.com.br"],
  extrair(html) {
    const blocos = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map((m) => textoSemTags(m[1]!));
    // O <title> é "Música - Artista - Cifra Club". O h1 da página é a música.
    const partes = (tituloDaPagina(html) ?? "").split(" - ").map((p) => p.trim());
    const musica = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
    const nomeMusica = musica ? textoSemTags(musica[1]!).trim() : partes[0];
    const artista = partes.length >= 3 ? partes[1] : undefined;
    const titulo = nomeMusica ? (artista ? `${artista}, ${nomeMusica}` : nomeMusica) : null;
    return { titulo, texto: blocos.join("\n\n").trim() };
  },
};
