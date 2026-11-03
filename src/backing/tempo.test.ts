import { describe, expect, it } from "vitest";
import { falarFalta, falarTempo } from "./tempo";

describe("falarTempo", () => {
  it("fala minutos e segundos", () => {
    expect(falarTempo(0)).toBe("0 segundos");
    expect(falarTempo(1)).toBe("1 segundo");
    expect(falarTempo(60)).toBe("1 minuto");
    expect(falarTempo(65.7)).toBe("1 minuto e 5 segundos");
    expect(falarTempo(239)).toBe("3 minutos e 59 segundos");
  });
  it("estima o que falta", () => {
    expect(falarFalta(20)).toBe("menos de 1 minuto");
    expect(falarFalta(80)).toBe("cerca de 1 minuto");
    expect(falarFalta(600)).toBe("cerca de 10 minutos");
  });
});
