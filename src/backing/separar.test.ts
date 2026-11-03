import { describe, expect, it } from "vitest";
import { quantosTrechos, separarBaixo, TRECHO, type RodarModelo } from "./separar";

/** Modelo falso: diz que o baixo é metade do sinal, e conta as chamadas. */
function modeloFalso() {
  const chamadas: number[] = [];
  const rodar: RodarModelo = async (entrada) => {
    chamadas.push(entrada.length);
    return entrada.map((x) => x * 0.5);
  };
  return { rodar, chamadas };
}

function musica(n: number) {
  const esquerdo = new Float32Array(n);
  const direito = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    esquerdo[i] = Math.sin(i / 50);
    direito[i] = Math.cos(i / 70);
  }
  return { esquerdo, direito };
}

describe("separarBaixo", () => {
  for (const n of [1000, TRECHO, TRECHO + 1, 3 * TRECHO + 12345]) {
    it(`emenda os trechos sem distorcer, com ${n} amostras`, async () => {
      const m = musica(n);
      const { rodar, chamadas } = modeloFalso();
      const progresso: string[] = [];
      const r = await separarBaixo(m, rodar, (f, t) => progresso.push(`${f}/${t}`));
      expect(chamadas.length).toBe(quantosTrechos(n));
      expect(progresso.at(-1)).toBe(`${chamadas.length}/${chamadas.length}`);
      let erro = 0;
      for (let i = 0; i < n; i++) {
        erro = Math.max(erro, Math.abs(r.baixo.esquerdo[i]! - m.esquerdo[i]! * 0.5));
        erro = Math.max(erro, Math.abs(r.semBaixo.direito[i]! - m.direito[i]! * 0.5));
      }
      expect(erro).toBeLessThan(1e-5);
    });
  }

  it("para quando cancelado", async () => {
    const c = new AbortController();
    c.abort();
    await expect(separarBaixo(musica(10), modeloFalso().rodar, undefined, c.signal)).rejects.toThrow("Cancelado");
  });
});

describe("mixarWav", async () => {
  const { mixarWav } = await import("./wav");
  it("gera um WAV estéreo de 16 bits com o baixo no volume pedido", async () => {
    const um = new Float32Array([0.5, -0.5]);
    const faixas = { semBaixo: { esquerdo: um, direito: um }, baixo: { esquerdo: um, direito: um } };
    const bytes = new DataView(await mixarWav(faixas, 0.5).arrayBuffer());
    expect(bytes.byteLength).toBe(44 + 2 * 4);
    expect(bytes.getUint16(22, true)).toBe(2);
    expect(bytes.getInt16(44, true)).toBe(Math.round(0.75 * 32767));
    expect(bytes.getInt16(48, true)).toBe(Math.round(-0.75 * 32767));
  });
});
