import type { Fonte } from "./tipos";
import { decodificar, tituloDaPagina } from "./html";

interface DadosUG {
  store?: { page?: { data?: { tab?: { song_name?: string; artist_name?: string }; tab_view?: { wiki_tab?: { content?: string } } } } };
}

/**
 * Ultimate Guitar. A página traz os dados num JSON dentro do atributo data-content
 * de um div com a classe js-store. A tab vem marcada com [tab] e [ch].
 */
export const ultimateGuitar: Fonte = {
  id: "ultimate-guitar",
  nome: "Ultimate Guitar",
  dominios: ["tabs.ultimate-guitar.com", "www.ultimate-guitar.com", "ultimate-guitar.com"],
  extrair(html) {
    const m = /class="js-store"[^>]*data-content="([^"]*)"/i.exec(html) ?? /data-content="([^"]*)"[^>]*class="js-store"/i.exec(html);
    if (!m) return { titulo: tituloDaPagina(html), texto: "" };
    const dados = JSON.parse(decodificar(m[1]!)) as DadosUG;
    const pagina = dados.store?.page?.data;
    const conteudo = pagina?.tab_view?.wiki_tab?.content ?? "";
    const texto = conteudo
      .replace(/\r\n/g, "\n")
      .replace(/\[\/?(tab|ch)\]/g, "")
      .trim();
    const tab = pagina?.tab;
    const titulo = tab?.artist_name && tab.song_name ? `${tab.artist_name}, ${tab.song_name}` : tituloDaPagina(html);
    return { titulo, texto };
  },
};
