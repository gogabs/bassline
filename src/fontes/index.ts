import { cifraClub } from "./cifraclub";
import type { Fonte } from "./tipos";
import { ultimateGuitar } from "./ultimateguitar";

export type * from "./tipos";

const fontes: Fonte[] = [cifraClub, ultimateGuitar];

export function registrarFonte(fonte: Fonte): void {
  fontes.push(fonte);
}

export function listarFontes(): Fonte[] {
  return [...fontes];
}

/** A fonte que aceita este link, ou undefined. Só aceita https. */
export function fonteDoLink(link: string): { fonte: Fonte; url: URL } | undefined {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") return undefined;
  const fonte = fontes.find((f) => f.dominios.includes(url.hostname.toLowerCase()));
  return fonte ? { fonte, url } : undefined;
}

/** O texto parece um link, e não uma tab colada. */
export function pareceLink(texto: string): boolean {
  const t = texto.trim();
  return /^https?:\/\/\S+$/i.test(t);
}
