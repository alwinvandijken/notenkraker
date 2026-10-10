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
  /** sessies vrij oefenen, nieuwste eerst, hooguit 3 */
  sessions: SessionSummary[];
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  playedMinutes: number;
  totalMinutes: number;
  /** gespeeld als deel van de sessie, 0..100 */
  percent: number;
  notes: string[];
  label: PracticeSession["label"];
}

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const WEEKDAY = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTH = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** hele kalenderdagen tussen twee momenten, in lokale tijd */
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
const toMinutes = (ms: number) => (ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0);

export function childSummary({ rounds, sessions = [], statuses, noteIds, now = new Date() }:
  { rounds: Round[]; sessions?: PracticeSession[]; statuses: StatusMap; noteIds: NoteId[]; now?: Date }): ChildSummary {
  const daysAgo = (iso: string) => daysBetween(new Date(iso), now);
  const ago = (r: Round) => daysAgo(r.playedAt);
  const inWeek = (n: number) => n >= 0 && n < 7;
  const thisWeek = rounds.filter((r) => inWeek(ago(r)));
  const played = sessions.filter((p) => p.playedSeconds > 0);

  const msPerDay = new Array<number>(7).fill(0);
  for (const r of thisWeek) msPerDay[6 - ago(r)]! += r.ms;
  const freeSecPerDay = new Array<number>(7).fill(0);
  for (const p of played) { const n = daysAgo(p.startedAt); if (inWeek(n)) freeSecPerDay[6 - n]! += p.playedSeconds; }
  const days = msPerDay.map((ms, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    const game = toMinutes(ms), free = toMinutes(freeSecPerDay[i]! * 1000);
    return { label: WEEKDAY_SHORT[d.getDay()]!, minutes: game + free, game, free };
  });

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
    sessions: [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 3).map((p) => {
      const totalSec = Math.max(0, (Date.parse(p.endedAt) - Date.parse(p.startedAt)) / 1000);
      return {
        id: p.id, startedAt: p.startedAt, notes: p.notes, label: p.label,
        playedMinutes: Math.round(p.playedSeconds / 60), totalMinutes: Math.round(totalSec / 60),
        percent: totalSec ? Math.min(100, Math.round((100 * p.playedSeconds) / totalSec)) : 0,
      };
    }),
  };
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
