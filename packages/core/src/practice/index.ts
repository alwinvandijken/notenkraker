import type { PitchReading } from "../audio/index.js";

/**
 * Vrij oefenen (AC-112): luistert naar de lezingen van de toonherkenning en telt de tijd
 * waarin het instrument echt klinkt. Start en einde legt de server vast; dit telt wat er
 * daartussen gespeeld is. Een lezing telt als sax als de toon in het bereik van het
 * instrument ligt, duidelijk is en een tijdje op dezelfde hoogte blijft (spraak wiebelt).
 * Tijd wordt ingespoten zodat dit in tests zonder klok werkt.
 */
export interface PracticeOptions {
  /** klinkend bereik van het instrument, in midi */
  minMidi: number;
  maxMidi: number;
  startMs: number;
  /** minimale helderheid van een lezing (0..1), standaard 0.6 */
  minClarity?: number;
  /** zo lang moet dezelfde toon staan voordat hij telt, standaard 150 ms */
  stableMs?: number;
  /** een groter gat tussen twee lezingen telt niet als gespeeld, standaard 250 ms */
  maxGapMs?: number;
}

export type PracticeState = "playing" | "silent" | "noise";

/** per minuut sinds de start: gespeelde seconden en de klinkende noten (midi) */
export interface PracticeMinute { s: number; notes: number[] }

export interface PracticeSummary {
  elapsedMs: number;
  playedMs: number;
  /** gespeeld als deel van de hele sessie, 0..100 */
  percent: number;
  minutes: PracticeMinute[];
  notes: number[];
}

/** een toon telt als noot van de sessie als hij zo lang staat */
const NOTE_MS = 300;
/** zo lang na de laatste lezing zegt de tracker nog wat hij hoorde */
const RECENT_MS = 400;

export class PracticeTracker {
  private playedPerMinute: number[] = [];
  private notesPerMinute: Array<Set<number>> = [];
  private stableMidi: number | null = null;
  private stableSince = 0;
  private lastMs: number | null = null;
  private lastPlayingMs = -Infinity;
  private lastNoiseMs = -Infinity;

  constructor(private opts: PracticeOptions) {}

  /** voer elke lezing in (null = stilte) */
  push(reading: PitchReading | null, nowMs: number) {
    const { minMidi, maxMidi, minClarity = 0.6, stableMs = 150, maxGapMs = 250 } = this.opts;
    const prev = this.lastMs;
    this.lastMs = nowMs;
    const inRange = reading !== null && reading.clarity >= minClarity && reading.midi >= minMidi && reading.midi <= maxMidi;
    if (!reading) { this.stableMidi = null; return; }
    if (!inRange) { this.stableMidi = null; this.lastNoiseMs = nowMs; return; }
    const gap = prev === null ? Infinity : nowMs - prev;
    if (reading.midi !== this.stableMidi || gap > maxGapMs) {
      this.stableMidi = reading.midi; this.stableSince = nowMs; this.lastNoiseMs = nowMs; return;
    }
    const held = nowMs - this.stableSince;
    if (held < stableMs) { this.lastNoiseMs = nowMs; return; }
    this.add(prev!, nowMs);
    this.lastPlayingMs = nowMs;
    if (held >= NOTE_MS) this.minuteNotes(nowMs).add(reading.midi);
  }

  state(nowMs: number): PracticeState {
    if (nowMs - this.lastPlayingMs <= RECENT_MS) return "playing";
    if (nowMs - this.lastNoiseMs <= RECENT_MS) return "noise";
    return "silent";
  }

  /** de toon die nu telt, of null */
  currentMidi(nowMs: number): number | null {
    return this.state(nowMs) === "playing" ? this.stableMidi : null;
  }

  summary(nowMs: number): PracticeSummary {
    const elapsedMs = Math.max(0, nowMs - this.opts.startMs);
    const count = Math.max(this.playedPerMinute.length, this.notesPerMinute.length);
    const minutes: PracticeMinute[] = Array.from({ length: count }, (_, i) => ({
      s: Math.round((this.playedPerMinute[i] ?? 0) / 1000),
      notes: [...(this.notesPerMinute[i] ?? [])].sort((a, b) => a - b),
    }));
    const playedMs = Math.min(elapsedMs, this.playedPerMinute.reduce((sum, ms) => sum + (ms ?? 0), 0));
    const notes = [...new Set(minutes.flatMap((m) => m.notes))].sort((a, b) => a - b);
    return { elapsedMs, playedMs, percent: elapsedMs ? Math.round((100 * playedMs) / elapsedMs) : 0, minutes, notes };
  }

  /** gespeelde tijd van `from` tot `to` verdelen over de minuten */
  private add(from: number, to: number) {
    let t = from;
    while (t < to) {
      const i = this.minuteIndex(t);
      const end = Math.min(to, this.opts.startMs + (i + 1) * 60_000);
      this.ensure(i);
      this.playedPerMinute[i]! += end - t;
      t = end;
    }
  }

  private minuteIndex(ms: number) { return Math.max(0, Math.floor((ms - this.opts.startMs) / 60_000)); }

  private ensure(i: number) {
    while (this.playedPerMinute.length <= i) this.playedPerMinute.push(0);
    while (this.notesPerMinute.length <= i) this.notesPerMinute.push(new Set());
  }

  private minuteNotes(ms: number) {
    const i = this.minuteIndex(ms);
    this.ensure(i);
    return this.notesPerMinute[i]!;
  }
}
