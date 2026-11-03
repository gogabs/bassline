import type { Estereo } from "./separar";

export type PedidoAoTrabalhador = { tipo: "separar"; esquerdo: Float32Array; direito: Float32Array } | { tipo: "cancelar" };

export type MensagemDoTrabalhador =
  | { tipo: "modelo"; recebido: number; total: number }
  | { tipo: "preparando" }
  | { tipo: "separando"; feitos: number; total: number; placa: boolean; segundos: number }
  | { tipo: "pronto"; semBaixo: Estereo; baixo: Estereo }
  | { tipo: "cancelado" }
  | { tipo: "erro"; mensagem: string };
