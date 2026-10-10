import type { NoteId, StatusMap } from "@notenkraker/core";
import type { PracticeSession, Round } from "./types.js";

/**
 * Cijfers voor het ouder- en leraardashboard, berekend uit de gespeelde rondes, de
 * sessies vrij oefenen en de notenstatus. "Deze week" betekent de laatste 7 dagen, vandaag meegeteld, in lokale tijd.
 */
export interface ChildSummary {
  /**
   * de laatste 7 dagen, oudste eerst; minuten afgerond, een korte ronde telt als 1 minuut.
   * game = spelletjes, free = gespeelde tijd bij vrij oefenen, minutes = samen
   */
  days: Array<{ label: string; minutes: number; game: number; free: number }>;
  /** dagen op rij geoefend, tot vandaag (of tot gisteren als er vandaag nog niet geoefend is) */
  streak: number;
  /** null = nog nooit geoefend */
  daysSinceLast: number | null;
  notes: { kent: number; les: number; nog: number; total: number };
  lesNotes: NoteId[];
  /** vaakst fout deze week, hooguit 3 */
  weak: Array<{ noteId: NoteId; wrong: number }>;
  week: { rounds: number; minutes: number };
  /** de laatste 28 dagen, oudste eerst; date in lokale tijd (jjjj-mm-dd), label bijv. "za 10" */
  history: HistoryDay[];
  /** sessies vrij oefenen, nieuwste eerst, hooguit 3 */
  sessions: SessionSummary[];
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  playedMinutes: number;
  totalMinutes: number;
  playedSeconds: number;
  totalSeconds: number;
  /** gespeeld als deel van de sessie, 0..100 */
  percent: number;
  notes: string[];
  label: PracticeSession["label"];
  /** gespeelde seconden per minuut */
  perMinute: number[];
}

export interface HistoryDay { date: string; label: string; minutes: number; game: number; free: number }

export const HISTORY_DAYS = 28;

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const WEEKDAY = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTH = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** hele kalenderdagen tussen twee momenten, in lokale tijd */
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
const toMinutes = (ms: number) => (ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0);
const pad = (n: number) => String(n).padStart(2, "0");
/** jjjj-mm-dd in lokale tijd */
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function sessionSummary(p: PracticeSession): SessionSummary {
  const totalSec = Math.max(0, (Date.parse(p.endedAt) - Date.parse(p.startedAt)) / 1000);
  return {
    id: p.id, startedAt: p.startedAt, notes: p.notes, label: p.label, perMinute: p.minutes.map((m) => m.s),
    playedMinutes: Math.round(p.playedSeconds / 60), totalMinutes: Math.round(totalSec / 60),
    playedSeconds: p.playedSeconds, totalSeconds: Math.round(totalSec),
    percent: totalSec ? Math.min(100, Math.round((100 * p.playedSeconds) / totalSec)) : 0,
  };
}

export function childSummary({ rounds, sessions = [], statuses, noteIds, now = new Date() }:
  { rounds: Round[]; sessions?: PracticeSession[]; statuses: StatusMap; noteIds: NoteId[]; now?: Date }): ChildSummary {
  const daysAgo = (iso: string) => daysBetween(new Date(iso), now);
  const ago = (r: Round) => daysAgo(r.playedAt);
  const inWeek = (n: number) => n >= 0 && n < 7;
  const thisWeek = rounds.filter((r) => inWeek(ago(r)));
  const played = sessions.filter((p) => p.playedSeconds > 0);

  const last = HISTORY_DAYS - 1;
  const msPerDay = new Array<number>(HISTORY_DAYS).fill(0);
  for (const r of rounds) { const n = ago(r); if (n >= 0 && n <= last) msPerDay[last - n]! += r.ms; }
  const freeSecPerDay = new Array<number>(HISTORY_DAYS).fill(0);
  for (const p of played) { const n = daysAgo(p.startedAt); if (n >= 0 && n <= last) freeSecPerDay[last - n]! += p.playedSeconds; }
  const history: HistoryDay[] = msPerDay.map((ms, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (last - i));
    const game = toMinutes(ms), free = toMinutes(freeSecPerDay[i]! * 1000);
    return { date: dateKey(d), label: `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}`, minutes: game + free, game, free };
  });
  const days = history.slice(-7).map((d) => ({ label: d.label.split(" ")[0]!, minutes: d.minutes, game: d.game, free: d.free }));

  const activeDays = [...rounds.map(ago), ...played.map((p) => daysAgo(p.startedAt))];
  const practiced = new Set(activeDays);
  let streak = 0;
  for (let d = practiced.has(0) ? 0 : 1; practiced.has(d); d++) streak++;
  const daysSinceLast = activeDays.length ? Math.min(...activeDays) : null;

  const kent = noteIds.filter((n) => statuses[n] === "kent").length;
  const lesNotes = noteIds.filter((n) => statuses[n] === "les");

  const wrong = new Map<NoteId, number>();
  for (const r of thisWeek) for (const n of r.wrongNotes) wrong.set(n, (wrong.get(n) ?? 0) + 1);
  const weak = [...wrong].map(([noteId, w]) => ({ noteId, wrong: w }))
    .sort((a, b) => b.wrong - a.wrong || a.noteId.localeCompare(b.noteId)).slice(0, 3);

  return {
    days, streak, daysSinceLast,
    notes: { kent, les: lesNotes.length, nog: noteIds.length - kent - lesNotes.length, total: noteIds.length },
    lesNotes, weak,
    week: { rounds: thisWeek.length, minutes: days.reduce((sum, d) => sum + d.minutes, 0) },
    history,
    sessions: [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 3).map(sessionSummary),
  };
}

export type DayItem =
  | ({ kind: "vrij"; at: string } & SessionSummary)
  | { kind: "spel"; id: string; at: string; correct: number; total: number; minutes: number; stars: number; wrongNotes: NoteId[] };

/** alles van één dag (date = jjjj-mm-dd, lokale tijd) voor het detailpaneel, vroegste eerst */
export function dayDetail({ rounds, sessions, date }: { rounds: Round[]; sessions: PracticeSession[]; date: string }):
  { items: DayItem[]; game: number; free: number } {
  const onDay = (iso: string) => dateKey(new Date(iso)) === date;
  const items: DayItem[] = [
    ...rounds.filter((r) => onDay(r.playedAt)).map((r): DayItem => ({
      kind: "spel", id: r.id, at: r.playedAt, correct: r.answers.filter((a) => a.correct).length, total: r.answers.length,
      minutes: toMinutes(r.ms), stars: r.stars, wrongNotes: r.wrongNotes,
    })),
    ...sessions.filter((p) => onDay(p.startedAt) && p.playedSeconds > 0).map((p): DayItem => ({ kind: "vrij", at: p.startedAt, ...sessionSummary(p) })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return {
    items,
    game: toMinutes(rounds.filter((r) => onDay(r.playedAt)).reduce((n, r) => n + r.ms, 0)),
    free: toMinutes(sessions.filter((p) => onDay(p.startedAt)).reduce((n, p) => n + p.playedSeconds, 0) * 1000),
  };
}

/** korte tijden in seconden, langere in hele minuten: "12 s", "16 min" */
export function durationLabel(seconds: number): string {
  return seconds < 60 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
}

/** gespeeld van totaal, in één eenheid als dat kan: "12 van 13 s", "16 van 22 min", "40 s van 2 min" */
export function playedOfTotal(played: number, total: number): string {
  if (total < 60) return `${Math.round(played)} van ${Math.round(total)} s`;
  if (played >= 60) return `${Math.round(played / 60)} van ${Math.round(total / 60)} min`;
  return `${durationLabel(played)} van ${durationLabel(total)}`;
}

/** "vandaag 15:20", "gisteren", "woensdag" (deze week) of "1 okt" */
export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const ago = daysBetween(d, now);
  if (ago === 0) return `vandaag ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (ago === 1) return "gisteren";
  if (ago < 7) return WEEKDAY[d.getDay()]!;
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}
