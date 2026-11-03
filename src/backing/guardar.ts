/**
 * Guarda a backing track de cada tab no navegador (IndexedDB), para não separar de novo.
 * As faixas ficam em 16 bits, metade do espaço. Uma música de 4 minutos ocupa uns 85 MB.
 */
import type { Estereo, Separado } from "./separar";

export type Origem = { tipo: "arquivo"; nome: string } | { tipo: "youtube"; id: string; titulo: string };

export interface BackingSalva {
  faixas: Separado;
  origem: Origem;
}

interface Registro {
  origem: Origem;
  canais: Int16Array[];
}

const BANCO = "bassline-backing";
const LOJA = "faixas";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function pedir<T>(modo: IDBTransactionMode, fazer: (loja: IDBObjectStore) => IDBRequest): Promise<T> {
  const banco = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const r = fazer(banco.transaction(LOJA, modo).objectStore(LOJA));
      r.onsuccess = () => resolve(r.result as T);
      r.onerror = () => reject(r.error);
    });
  } finally {
    banco.close();
  }
}

const para16 = (a: Float32Array) => Int16Array.from(a, (x) => Math.max(-32768, Math.min(32767, Math.round(x * 32767))));
const de16 = (a: Int16Array) => Float32Array.from(a, (x) => x / 32767);

export async function salvarBacking(tabId: string, b: BackingSalva): Promise<void> {
  const { semBaixo, baixo } = b.faixas;
  const canais = [semBaixo.esquerdo, semBaixo.direito, baixo.esquerdo, baixo.direito].map(para16);
  await pedir("readwrite", (l) => l.put({ origem: b.origem, canais } satisfies Registro, tabId));
}

export async function lerBacking(tabId: string): Promise<BackingSalva | null> {
  const r = await pedir<Registro | undefined>("readonly", (l) => l.get(tabId));
  if (!r) return null;
  const [a, b, c, d] = r.canais.map(de16) as [Float32Array, Float32Array, Float32Array, Float32Array];
  const est = (e: Float32Array, di: Float32Array): Estereo => ({ esquerdo: e, direito: di });
  return { origem: r.origem, faixas: { semBaixo: est(a, b), baixo: est(c, d) } };
}

export async function apagarBacking(tabId: string): Promise<void> {
  await pedir("readwrite", (l) => l.delete(tabId));
}
