const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Troca entidades HTML (&amp;, &#39;, &#x2F;) pelos caracteres. */
export function decodificar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (inteiro, nome: string) => {
    if (nome[0] === "#") {
      const n = nome[1] === "x" || nome[1] === "X" ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : inteiro;
    }
    return ENTIDADES[nome.toLowerCase()] ?? inteiro;
  });
}

/** Remove as tags, mantendo quebras de linha de <br>. */
export function textoSemTags(html: string): string {
  return decodificar(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
}

/** Conteúdo da tag <title>, sem o nome do site depois do traço. */
export function tituloDaPagina(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? textoSemTags(m[1]!).trim() : null;
}
