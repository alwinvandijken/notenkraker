import { chromaticRange, idToMidi, isAltered, parseId, type NoteId } from "../music/index.js";
import type { StatusMap } from "../game/index.js";

/**
 * Wat we van een leerling weten uit de kennismaking (AC-115, mock-up docs/mockups/Kennismaking.html):
 * leeftijdsgroep en hoe lang hij al speelt. Daaruit volgen het spel, het dagdoel en de toets.
 */
export type AgeBand = "6-8" | "9-12" | "13-17" | "18+";
export type Experience = "nieuw" | "lt1" | "1-3" | "gt3";
export const AGE_BANDS: AgeBand[] = ["6-8", "9-12", "13-17", "18+"];
export const EXPERIENCES: Experience[] = ["nieuw", "lt1", "1-3", "gt3"];

export interface AgeProfile {
  /** noten per ronde in het notenspel */
  roundLength: number;
  lives: number;
  /** stopwatch tonen in het spel */
  showTimer: boolean;
  /** voorgesteld dagdoel in minuten */
  dailyGoal: number;
}

const PROFILES: Record<AgeBand, AgeProfile> = {
  "6-8": { roundLength: 5, lives: 4, showTimer: false, dailyGoal: 10 },
  "9-12": { roundLength: 8, lives: 3, showTimer: true, dailyGoal: 15 },
  "13-17": { roundLength: 8, lives: 3, showTimer: true, dailyGoal: 20 },
  "18+": { roundLength: 8, lives: 3, showTimer: true, dailyGoal: 20 },
};

/** zonder leeftijd: het spel zoals het was (8 noten, 3 levens) */
export function ageProfile(band: AgeBand | null | undefined): AgeProfile {
  return band ? PROFILES[band] : PROFILES["9-12"];
}

/**
 * Alle noten van het instrument van makkelijk naar moeilijk: eerst de startnoten, dan de
 * stamtonen op volgorde van afstand tot de startnoten, dan de kruizen en mollen op dezelfde manier.
 */
export function noteLadder(range: [NoteId, NoteId], starter: NoteId[]): NoteId[] {
  const all = chromaticRange(range[0], range[1]);
  const center = starter.length ? starter.reduce((s, n) => s + idToMidi(n), 0) / starter.length : idToMidi(all[Math.floor(all.length / 2)]!);
  const rest = all.filter((n) => !starter.includes(n));
  const byDistance = (a: NoteId, b: NoteId) => Math.abs(idToMidi(a) - center) - Math.abs(idToMidi(b) - center) || idToMidi(a) - idToMidi(b);
  const naturals = rest.filter((n) => !isAltered(parseId(n))).sort(byDistance);
  const altered = rest.filter((n) => isAltered(parseId(n))).sort(byDistance);
  return [...starter.filter((n) => all.includes(n)), ...naturals, ...altered];
}

/** waar de toets begint op de ladder; null = geen toets (net begonnen) */
export function placementStart(experience: Experience): number | null {
  return { nieuw: null, lt1: 0, "1-3": 4, gt3: 8 }[experience];
}

/**
 * Korte toets: 8 verschillende noten. Goed → twee treden lastiger, fout of "weet ik niet" →
 * een trede makkelijker. Geen tijd, geen levens.
 */
export class PlacementTest {
  readonly asked: Array<{ note: NoteId; correct: boolean }> = [];
  private index: number;

  constructor(private ladder: NoteId[], start: number, private length = 8) {
    this.index = Math.max(0, Math.min(start, ladder.length - 1));
  }

  get done() { return this.asked.length >= Math.min(this.length, this.ladder.length); }

  current(): NoteId | null { return this.done ? null : this.ladder[this.index]!; }

  answer(correct: boolean) {
    const note = this.current();
    if (note === null) return;
    this.asked.push({ note, correct });
    if (this.done) return;
    const target = Math.max(0, Math.min(this.ladder.length - 1, this.index + (correct ? 2 : -1)));
    this.index = this.nearestUnasked(target, correct ? 1 : -1);
  }

  /** alle noten tot en met de lastigste die goed ging, behalve wat fout ging */
  result(): NoteId[] {
    const ok = this.asked.filter((a) => a.correct).map((a) => this.ladder.indexOf(a.note));
    if (ok.length === 0) return [];
    const wrong = new Set(this.asked.filter((a) => !a.correct).map((a) => a.note));
    return this.ladder.slice(0, Math.max(...ok) + 1).filter((n) => !wrong.has(n));
  }

  private nearestUnasked(target: number, direction: 1 | -1): number {
    const asked = new Set(this.asked.map((a) => a.note));
    for (let d = 0; d < this.ladder.length; d++) {
      for (const i of [target + d * direction, target - d * direction]) {
        if (i >= 0 && i < this.ladder.length && !asked.has(this.ladder[i]!)) return i;
      }
    }
    return target;
  }
}

/** de eerstvolgende noot om te leren: de eerste op de ladder zonder status */
export function nextNewNote(ladder: NoteId[], statuses: StatusMap): NoteId | null {
  return ladder.find((n) => !statuses[n]) ?? null;
}
