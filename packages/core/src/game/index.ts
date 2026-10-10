import type { NoteId } from "../music/index.js";

/**
 * Spelregels. Puur: geen tijd, geen random zonder injectie, geen opslag.
 * De server (Edge Function `rounds`) en de app gebruiken dezelfde functies,
 * zodat sterren/XP overal hetzelfde uitkomen.
 */

export type NoteStatus = "kent" | "les" | "moet";
export type StatusMap = Record<NoteId, NoteStatus>;

export const WEIGHT: Record<NoteStatus, number> = { kent: 1, les: 3, moet: 3 };

/** Gewogen pool: noten in de les of nog te leren komen vaker voorbij. */
export function weightedPool(statuses: StatusMap, fallback: NoteId[]): NoteId[] {
  const pool: NoteId[] = [];
  for (const [id, st] of Object.entries(statuses)) for (let i = 0; i < WEIGHT[st]; i++) pool.push(id);
  return pool.length ? pool : [...fallback];
}

export type Rng = () => number; // [0,1)

/** Reeks van `length` noten zonder twee dezelfde achter elkaar (waar mogelijk). */
export function makeSequence(pool: NoteId[], length: number, rng: Rng = Math.random): NoteId[] {
  if (pool.length === 0) throw new Error("lege pool");
  const seq: NoteId[] = [];
  for (let i = 0; i < length; i++) {
    let pick = pool[Math.floor(rng() * pool.length)]!;
    let tries = 0;
    while (seq.length && pick === seq[seq.length - 1] && tries++ < 10) pick = pool[Math.floor(rng() * pool.length)]!;
    seq.push(pick);
  }
  return seq;
}

export interface Answer { expected: NoteId; given: NoteId | null; correct: boolean }

export interface RoundInput {
  mode: "buttons" | "mic";
  lives: number;
  answers: Answer[];
  ms: number;
}

export interface RoundResult {
  completed: boolean;
  mistakes: number;
  stars: 0 | 1 | 2 | 3;
  xp: number;
  wrongNotes: NoteId[];
}

export const LIVES = 3;

export function scoreRound(input: RoundInput, statuses: StatusMap = {}): RoundResult {
  const mistakes = input.answers.filter((a) => !a.correct).length;
  const completed = mistakes < input.lives;
  const stars: RoundResult["stars"] = !completed ? 0 : mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1;
  let xp = 0;
  for (const a of input.answers) {
    if (!a.correct) continue;
    const st = statuses[a.expected];
    xp += st === "les" || st === "moet" ? 20 : 10;
  }
  if (completed && mistakes === 0) xp += 50;
  return { completed, mistakes, stars, xp, wrongNotes: input.answers.filter((a) => !a.correct).map((a) => a.expected) };
}

/** Voorstel: een "les"-noot die in de laatste N rondes nooit fout ging mag naar "kent". */
export function promotionCandidates(statuses: StatusMap, recentRounds: Array<{ answers: Answer[] }>, minRounds = 3): NoteId[] {
  const seen = new Map<NoteId, { rounds: number; wrong: number }>();
  for (const r of recentRounds) {
    const inRound = new Set(r.answers.map((a) => a.expected));
    for (const id of inRound) {
      const s = seen.get(id) ?? { rounds: 0, wrong: 0 };
      s.rounds++;
      if (r.answers.some((a) => a.expected === id && !a.correct)) s.wrong++;
      seen.set(id, s);
    }
  }
  return Object.entries(statuses)
    .filter(([id, st]) => st === "les" && (seen.get(id)?.rounds ?? 0) >= minRounds && seen.get(id)!.wrong === 0)
    .map(([id]) => id);
}
