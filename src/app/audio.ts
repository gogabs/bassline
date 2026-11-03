import type { Measure, Note } from "../parser";

export interface OpcoesSom {
  bpm: number;
  /** 0 a 100. */
  volume: number;
  timbre: "redondo" | "brilhante";
}

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Harmônico natural: a altura depende da casa, não da nota pressionada. */
function midiHarmonico(n: Note): number | null {
  if (n.midi === null || n.fret === null) return n.midi;
  const solta = n.midi - n.fret;
  const acima: Record<number, number> = { 12: 12, 7: 19, 19: 19, 5: 24, 24: 24, 4: 28, 9: 28, 16: 28, 3: 31 };
  return solta + (acima[n.fret] ?? 12);
}

interface Voz {
  inicio: number;
  fim: number;
  /** Mudanças de altura ao longo da voz (hammer, pull, slide, bend). */
  alturas: { tempo: number; midi: number; deslizar: boolean }[];
  nota: Note;
}

/**
 * Sintetizador simples de baixo, feito com a Web Audio API.
 * Toca um compasso por vez. O tempo vem da posição aproximada de cada evento na tab.
 */
export class Tocador {
  private ctx: AudioContext | null = null;
  private nos: AudioNode[] = [];
  private fimTimer: ReturnType<typeof setTimeout> | null = null;

  /** Toca o compasso e resolve quando o som termina. */
  tocar(compasso: Measure, opcoes: OpcoesSom): Promise<void> {
    this.parar();
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx ??= new AC();
    const ctx = this.ctx;
    void ctx.resume();

    const duracao = (4 * 60) / opcoes.bpm;
    const t0 = ctx.currentTime + 0.05;
    const mestre = ctx.createGain();
    mestre.gain.value = opcoes.volume / 100;
    mestre.connect(ctx.destination);
    this.nos.push(mestre);

    for (const voz of montarVozes(compasso, duracao)) this.tocarVoz(ctx, mestre, voz, t0, opcoes);

    return new Promise((resolve) => {
      this.fimTimer = setTimeout(() => {
        this.fimTimer = null;
        resolve();
      }, (duracao + 0.2) * 1000);
    });
  }

  parar(): void {
    if (this.fimTimer) clearTimeout(this.fimTimer);
    this.fimTimer = null;
    for (const no of this.nos) {
      try {
        if (no instanceof AudioScheduledSourceNode) no.stop();
        no.disconnect();
      } catch {
        // Já parado.
      }
    }
    this.nos = [];
  }

  private tocarVoz(ctx: AudioContext, saida: AudioNode, voz: Voz, t0: number, opcoes: OpcoesSom): void {
    const n = voz.nota;
    const t = new Set(n.techniques);
    const inicio = t0 + voz.inicio;
    let fim = t0 + voz.fim;

    if (t.has("dead") || n.midi === null) {
      this.ruido(ctx, saida, inicio, 0.05);
      return;
    }
    if (t.has("ghost")) fim = Math.min(fim, inicio + 0.09);
    if (t.has("palm-mute")) fim = Math.min(fim, inicio + 0.18);

    const harmonico = t.has("natural-harmonic") || t.has("artificial-harmonic");
    const osc = ctx.createOscillator();
    osc.type = harmonico ? "sine" : "sawtooth";
    const sub = ctx.createOscillator();
    sub.type = "sine";

    const primeira = harmonico ? midiHarmonico(n)! : voz.alturas[0]!.midi;
    for (const o of [osc, sub]) o.frequency.setValueAtTime(freq(primeira), inicio);
    let anterior = primeira;
    let tAnterior = inicio;
    for (const a of voz.alturas.slice(1)) {
      const quando = t0 + a.tempo;
      for (const o of [osc, sub]) {
        if (a.deslizar) {
          // Segura a nota e desliza só no final, como um slide de verdade.
          o.frequency.setValueAtTime(freq(anterior), Math.max(tAnterior, quando - 0.09));
          o.frequency.linearRampToValueAtTime(freq(a.midi), quando);
        } else o.frequency.setValueAtTime(freq(a.midi), quando);
      }
      anterior = a.midi;
      tAnterior = quando;
    }

    if (t.has("vibrato")) {
      const lfo = ctx.createOscillator();
      const prof = ctx.createGain();
      lfo.frequency.value = 5.5;
      prof.gain.value = freq(primeira) * 0.015;
      lfo.connect(prof);
      prof.connect(osc.frequency);
      prof.connect(sub.frequency);
      lfo.start(inicio + 0.1);
      lfo.stop(fim);
      this.nos.push(lfo, prof);
    }

    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    const brilho = opcoes.timbre === "brilhante" ? 2200 : 900;
    const ataque = t.has("slap") || t.has("pop") ? brilho * 2.5 : brilho * 1.6;
    filtro.frequency.setValueAtTime(t.has("palm-mute") ? 400 : ataque, inicio);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(200, brilho * 0.5), Math.max(inicio + 0.01, fim));

    const env = ctx.createGain();
    const pico = t.has("ghost") ? 0.25 : t.has("pop") ? 0.9 : t.has("slap") ? 0.8 : 0.6;
    env.gain.setValueAtTime(0, inicio);
    env.gain.linearRampToValueAtTime(pico, inicio + 0.006);
    env.gain.exponentialRampToValueAtTime(pico * 0.5, inicio + 0.15);
    env.gain.setValueAtTime(pico * 0.5, Math.max(inicio + 0.15, fim - 0.04));
    env.gain.linearRampToValueAtTime(0, fim);

    const misturaSub = ctx.createGain();
    misturaSub.gain.value = harmonico ? 0 : 0.6;
    osc.connect(filtro);
    sub.connect(misturaSub);
    misturaSub.connect(filtro);
    filtro.connect(env);
    env.connect(saida);
    osc.start(inicio);
    sub.start(inicio);
    osc.stop(fim + 0.02);
    sub.stop(fim + 0.02);
    this.nos.push(osc, sub, filtro, env, misturaSub);
  }

  private ruido(ctx: AudioContext, saida: AudioNode, inicio: number, dur: number): void {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / dados.length);
    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.value = 1200;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    fonte.connect(filtro);
    filtro.connect(g);
    g.connect(saida);
    fonte.start(inicio);
    this.nos.push(fonte, filtro, g);
  }
}

/**
 * Transforma os eventos do compasso em vozes. Uma nota ligada à seguinte (hammer, pull, slide)
 * continua a mesma voz, só mudando de altura, como no instrumento.
 */
export function montarVozes(compasso: Measure, duracao: number): Voz[] {
  const eventos = compasso.events;
  const vozes: Voz[] = [];
  const consumidas = new Set<Note>();
  const proximoTempo = (i: number) => (eventos[i + 1]?.position ?? 1) * duracao;

  eventos.forEach((evento, i) => {
    for (const nota of evento.notes) {
      if (consumidas.has(nota)) continue;
      const inicio = evento.position * duracao;
      const voz: Voz = { inicio, fim: proximoTempo(i) * 0.98, alturas: [{ tempo: inicio, midi: nota.midi ?? 0, deslizar: false }], nota };

      if (nota.bendTo !== undefined && nota.fret !== null && nota.midi !== null) {
        const meio = inicio + (voz.fim - inicio) / 2;
        voz.alturas.push({ tempo: meio, midi: nota.midi + (nota.bendTo - nota.fret), deslizar: true });
      }

      // Segue a cadeia de ligações na mesma corda.
      let atual = nota;
      let j = i;
      while (atual.linkTo && eventos[j + 1]) {
        const chegada = eventos[j + 1]!.notes.find((c) => c.stringNumber === atual.stringNumber && c.linkedFrom);
        if (!chegada || chegada.midi === null) break;
        consumidas.add(chegada);
        const tempoChegada = eventos[j + 1]!.position * duracao;
        const desliza = atual.linkTo.technique.startsWith("slide");
        voz.alturas.push({ tempo: tempoChegada, midi: chegada.midi, deslizar: desliza });
        voz.fim = proximoTempo(j + 1) * 0.98;
        atual = chegada;
        j++;
      }
      vozes.push(voz);
    }
  });
  return vozes;
}
