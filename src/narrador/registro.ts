import type { Narrador } from "./tipos";
import { narradorPortugues } from "./portugues";

const narradores = new Map<string, Narrador>();

export function registrarNarrador(narrador: Narrador): void {
  narradores.set(narrador.id, narrador);
}

export function listarNarradores(): Narrador[] {
  return [...narradores.values()];
}

/** Devolve o narrador pedido, ou o padrão em português se ele não existir. */
export function obterNarrador(id?: string): Narrador {
  return (id && narradores.get(id)) || narradorPortugues;
}

registrarNarrador(narradorPortugues);
