import { frequencyToMidi } from "../music/index.js";

/**
 * Toonherkenning op een buffer met samples. Platform-onafhankelijk: de app
 * (of een native host) levert Float32-samples en de samplerate; dit bestand
 * levert frequentie, midi en cents terug. Autocorrelatie met parabolische
 * verfijning; voldoende voor één monofoon instrument. Wie meer wil kan hier
 * `pitchy` (McLeod) inpluggen zonder dat de rest verandert.
 */

export interface PitchReading {
  hz: number;
  midi: number;      // afgerond
  cents: number;     // afwijking t.o.v. midi, -50..50
  clarity: number;   // 0..1, hoe zeker de detectie is
}

export interface DetectOptions {
  sampleRate: number;
  minHz?: number;    // standaard 60
  maxHz?: number;    // standaard 1500
  rmsThreshold?: number; // standaard 0.01
  a4?: number;
}

export function rms(buf: Float32Array): number {
  let s = 0;
  for (let i = 0; i < buf.length; i++) s += buf[i]! * buf[i]!;
  return Math.sqrt(s / buf.length);
}

export function detectPitch(buf: Float32Array, opts: DetectOptions): PitchReading | null {
  const { sampleRate, minHz = 60, maxHz = 1500, rmsThreshold = 0.01, a4 = 440 } = opts;
  if (rms(buf) < rmsThreshold) return null;
  const minLag = Math.max(1, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(buf.length - 2, Math.floor(sampleRate / minHz));
  if (maxLag <= minLag) return null;

  const ac = new Float32Array(maxLag + 2);
  let ac0 = 0;
  for (let i = 0; i < buf.length; i++) ac0 += buf[i]! * buf[i]!;
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i < buf.length - lag; i++) s += buf[i]! * buf[i + lag]!;
    ac[lag] = s;
  }
  // Eerste duidelijke piek na de eerste dip: voorkomt dat een veelvoud van de periode wint.
  let i = minLag;
  while (i < maxLag && ac[i]! > ac[i + 1]!) i++;
  let best = -Infinity, bestLag = -1;
  for (; i <= maxLag; i++) {
    if (ac[i]! > best) { best = ac[i]!; bestLag = i; }
    if (best > 0.9 * ac0 && ac[i]! < ac[i - 1]!) break;
  }
  if (bestLag < 1 || best <= 0) return null;
  const clarity = Math.max(0, Math.min(1, best / ac0));
  if (clarity < 0.3) return null;
  const a = ac[bestLag - 1] ?? 0, b = ac[bestLag]!, c = ac[bestLag + 1] ?? 0;
  const denom = a - 2 * b + c;
  const shift = denom === 0 ? 0 : (a - c) / (2 * denom);
  const hz = sampleRate / (bestLag + shift);
  const m = frequencyToMidi(hz, a4);
  const midi = Math.round(m);
  return { hz, midi, cents: Math.round((m - midi) * 100), clarity };
}

/**
 * Stabiliteitsvolger: pas "goed" als dezelfde toon een tijdje aanhoudt,
 * en pas "fout" als een andere toon echt blijft hangen. Tijd wordt
 * ingespoten zodat dit in tests zonder klok werkt.
 */
export interface MatchOptions {
  expectedMidi: number;
  toleranceCents?: number; // standaard 45
  holdMs?: number;         // standaard 250: hoe lang de goede toon moet staan
  wrongHoldMs?: number;    // standaard 1200: hoe lang een foute toon moet staan
}

export type MatchEvent = { type: "correct" } | { type: "wrong"; midi: number } | null;

export class NoteMatcher {
  private stableMidi: number | null = null;
  private since = 0;
  private fired = false;

  constructor(private opts: MatchOptions) {}

  reset(opts?: Partial<MatchOptions>) {
    if (opts) this.opts = { ...this.opts, ...opts };
    this.stableMidi = null; this.since = 0; this.fired = false;
  }

  /** Voer elke lezing in (null = stilte). Geeft hooguit één gebeurtenis per verwachte noot. */
  push(reading: PitchReading | null, nowMs: number): MatchEvent {
    if (this.fired) return null;
    if (!reading) { this.stableMidi = null; return null; }
    if (reading.midi !== this.stableMidi) { this.stableMidi = reading.midi; this.since = nowMs; return null; }
    const held = nowMs - this.since;
    const { expectedMidi, toleranceCents = 45, holdMs = 250, wrongHoldMs = 1200 } = this.opts;
    const correct = reading.midi === expectedMidi && Math.abs(reading.cents) <= toleranceCents;
    if (correct && held >= holdMs) { this.fired = true; return { type: "correct" }; }
    if (!correct && held >= wrongHoldMs) { this.fired = true; return { type: "wrong", midi: reading.midi }; }
    return null;
  }
}

/** Testhulp en referentietoon: sinus met boventonen, zoals een eenvoudige synth. */
export function synthBuffer(hz: number, sampleRate: number, length: number, harmonics = [1, 0.5, 0.25]): Float32Array {
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let v = 0;
    harmonics.forEach((amp, k) => { v += amp * Math.sin(2 * Math.PI * hz * (k + 1) * i / sampleRate); });
    out[i] = v * 0.3;
  }
  return out;
}
