/** Tabs convertidas, guardadas no navegador. Guardamos o texto original e convertemos de novo ao abrir. */
export interface TabSalva {
  id: string;
  titulo: string;
  texto: string;
  /** Link da tab original, quando veio de um site. */
  fonteUrl: string | null;
  criadaEm: number;
}

const CHAVE = "bassline.tabs";

export function listarTabs(): TabSalva[] {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo) return (JSON.parse(salvo) as TabSalva[]).sort((a, b) => b.criadaEm - a.criadaEm);
  } catch {
    // Sem armazenamento: lista vazia.
  }
  return [];
}

function gravar(tabs: TabSalva[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(tabs));
  } catch {
    // Ignora: a tab fica só na memória desta sessão.
  }
}

const naMemoria = new Map<string, TabSalva>();

export function salvarTab(dados: Omit<TabSalva, "id" | "criadaEm">): TabSalva {
  const tab: TabSalva = { ...dados, id: Math.random().toString(36).slice(2, 10), criadaEm: Date.now() };
  naMemoria.set(tab.id, tab);
  gravar([tab, ...listarTabs()]);
  return tab;
}

export function obterTab(id: string): TabSalva | undefined {
  return listarTabs().find((t) => t.id === id) ?? naMemoria.get(id);
}

export function apagarTab(id: string): void {
  naMemoria.delete(id);
  gravar(listarTabs().filter((t) => t.id !== id));
}
