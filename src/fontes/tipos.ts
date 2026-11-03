/**
 * Uma fonte é um site de onde dá para buscar tabs por link.
 * Para aceitar um site novo, escreva uma fonte e registre em fontes/index.ts.
 * As funções aqui são puras: quem baixa a página é o servidor.
 */
export interface Fonte {
  id: string;
  /** Nome do site, falado nas mensagens. */
  nome: string;
  /** Domínios aceitos. O servidor só busca páginas desses domínios. */
  dominios: string[];
  /** Tira o texto da tab e o título da música do HTML da página. */
  extrair(html: string, url: URL): TabExtraida;
}

export interface TabExtraida {
  /** Título da música, como "Paramore, Emergency". null se a página não disser. */
  titulo: string | null;
  /** Texto da tab, no formato ASCII que o parser entende. */
  texto: string;
}
