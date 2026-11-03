declare module "demucs-web/processor" {
  export interface Espectro {
    leftReal: Float32Array;
    leftImag: Float32Array;
    rightReal: Float32Array;
    rightImag: Float32Array;
  }
  export function prepareModelInput(
    left: Float32Array,
    right: Float32Array,
  ): { waveform: Float32Array; magSpec: Float32Array; numBins: number; numFrames: number };
  export function standaloneMask(freqOutput: Float32Array): Espectro[];
  export function standaloneIspec(spec: Espectro, length: number): { left: Float32Array; right: Float32Array };
}
