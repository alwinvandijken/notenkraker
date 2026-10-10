import type { NoteId, StatusMap } from "@notenkraker/core";
import type { Round } from "./types.js";

/**
 * Cijfers voor het ouder- en leraardashboard, berekend uit de gespeelde rondes en de
 * notenstatus. "Deze week" betekent de laatste 7 dagen, vandaag meegeteld, in lokale tijd.
 */
export interface ChildSummary {
  /** de laatste 7 dagen, oudste eerst; minuten afgerond, een korte ronde telt als 1 minuut */
  days: Array<{ label: string; minutes: number }>;
  /** dagen op rij geoefend, tot vandaag (of tot gisteren als er vandaag nog niet geoefend is) */
  streak: number;
  /** null = nog nooit geoefend */
  daysSinceLast: number | null;
  notes: { kent: number; les: number; nog: number; total: number };
  lesNotes: NoteId[];
  /** vaakst fout deze week, hooguit 3 */
  weak: Array<{ noteId: NoteId; wrong: number }>;
  week: { rounds: number; minutes: number };
}

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const WEEKDAY = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MONTH = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** hele kalenderdagen tussen twee momenten, in lokale tijd */
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
const toMinutes = (ms: number) => (ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0);

export function childSummary({ rounds, statuses, noteIds, now = new Date() }:
  { rounds: Round[]; statuses: StatusMap; noteIds: NoteId[]; now?: Date }): ChildSummary {
  const ago = (r: Round) => daysBetween(new Date(r.playedAt), now);
  const thisWeek = rounds.filter((r) => ago(r) >= 0 && ago(r) < 7);

  const msPerDay = new Array<number>(7).fill(0);
  for (const r of thisWeek) msPerDay[6 - ago(r)]! += r.ms;
  const days = msPerDay.map((ms, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { label: WEEKDAY_SHORT[d.getDay()]!, minutes: toMinutes(ms) };
  });

  const practiced = new Set(rounds.map(ago));
  let streak = 0;
  for (let d = practiced.has(0) ? 0 : 1; practiced.has(d); d++) streak++;
  const daysSinceLast = rounds.length ? Math.min(...rounds.map(ago)) : null;

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
