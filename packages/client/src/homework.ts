import { dateKey } from "./dashboard.js";
import type { Homework, Lesson, PracticeSession, Round } from "./types.js";

/**
 * Hoe gaat het met het huiswerk (AC-113)? Een dag telt als gehaald als het notenspel en vrij
 * oefenen samen het dagdoel halen. Elke dag van gegeven tot en met de einddatum telt mee; het
 * aantal dagen dat nodig is, is de dagen per week naar rato van de looptijd (een week = de dagen
 * per week). De status vergelijkt wat nog nodig is met de dagen die nog over zijn:
 * gaat goed (genoeg over), even opletten (elke dag die over is moet), loopt achter (niet meer te halen).
 */
export type HomeworkStatus = "goed" | "opletten" | "achter";

export interface HomeworkDay { date: string; label: string; minutes: number; state: "ok" | "half" | "none" | "future"; today: boolean }

export interface HomeworkProgress {
  days: HomeworkDay[];
  goalDays: number;
  doneDays: number;
  /** dagen die nog kunnen tellen: vandaag (als die nog niet gehaald is) tot en met de einddatum */
  daysLeft: number;
  todayMinutes: number;
  status: HomeworkStatus;
}

export const STATUS_LABEL: Record<HomeworkStatus | "geen", string> = {
  goed: "gaat goed", opletten: "even opletten", achter: "loopt achter", geen: "geen huiswerk",
};

const WEEKDAY_SHORT = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MONTH = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const parseDate = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y!, m! - 1, d!); };
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
const toMinutes = (ms: number) => (ms > 0 ? Math.max(1, Math.round(ms / 60_000)) : 0);

/** al het huiswerk dat nog loopt (einddatum vandaag of later), nieuwste eerst */
export function currentHomework(list: Homework[], now = new Date()): Homework[] {
  const today = dateKey(now);
  // de lopende les(sen); huiswerk voor de volgende les telt pas vanaf de startdatum (0013)
  return list.filter((h) => (h.startDate ?? "") <= today && h.dueDate >= today).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** huiswerk dat nog moet beginnen (de volgende les); alleen wie het gaf krijgt het van de database */
export function upcomingHomework(list: Homework[], now = new Date()): Homework[] {
  const today = dateKey(now);
  return list.filter((h) => (h.startDate ?? "") > today).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Start en eind van deze of de volgende les, zoals lesson_period in de database (0013). Met een vaste lesdag
 * loopt een les van lesdag tot de dag vóór de volgende; zonder lesdag begint deze les vandaag.
 */
export function lessonPeriod(weekday: number | null | undefined, which: Lesson, now = new Date()): { start: string; due: string } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const back = weekday === null || weekday === undefined ? 0 : (day.getDay() - weekday + 7) % 7;
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - back + (which === "volgende" ? 7 : 0));
  const due = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: dateKey(start), due: dateKey(due) };
}

/** geoefende minuten per dag (jjjj-mm-dd): notenspel en vrij oefenen, elk afgerond zoals op het dashboard */
function minutesByDate(rounds: Round[], sessions: PracticeSession[]): Map<string, number> {
  const game = new Map<string, number>(), free = new Map<string, number>();
  for (const r of rounds) { const k = dateKey(new Date(r.playedAt)); game.set(k, (game.get(k) ?? 0) + r.ms); }
  for (const p of sessions) { const k = dateKey(new Date(p.startedAt)); free.set(k, (free.get(k) ?? 0) + p.playedSeconds * 1000); }
  const out = new Map<string, number>();
  for (const k of new Set([...game.keys(), ...free.keys()])) out.set(k, toMinutes(game.get(k) ?? 0) + toMinutes(free.get(k) ?? 0));
  return out;
}

export function homeworkProgress(h: Homework, { rounds, sessions, now = new Date() }: { rounds: Round[]; sessions: PracticeSession[]; now?: Date }): HomeworkProgress {
  const start = startOfDay(new Date(h.createdAt));
  const due = parseDate(h.dueDate);
  const length = Math.max(1, daysBetween(start, due));
  const goalDays = Math.min(length + 1, Math.max(1, Math.round((h.daysPerWeek * length) / 7)));
  const perDay = minutesByDate(rounds, sessions);
  const today = dateKey(now);

  const days: HomeworkDay[] = [];
  for (let i = 0; i <= daysBetween(start, due); i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const date = dateKey(d);
    const minutes = perDay.get(date) ?? 0;
    const state = minutes >= h.minutesPerDay ? "ok" : minutes >= h.minutesPerDay / 2 ? "half" : date > today ? "future" : "none";
    days.push({ date, label: WEEKDAY_SHORT[d.getDay()]!, minutes, state, today: date === today });
  }

  const doneDays = days.filter((d) => d.state === "ok").length;
  const todayDone = days.some((d) => d.today && d.state === "ok");
  const daysLeft = Math.max(0, daysBetween(now, due) + 1) - (todayDone ? 1 : 0);
  const needed = goalDays - doneDays;
  const status: HomeworkStatus = needed <= 0 ? "goed" : daysLeft < needed ? "achter" : daysLeft === needed ? "opletten" : "goed";
  return { days, goalDays, doneDays, daysLeft, todayMinutes: perDay.get(today) ?? 0, status };
}

/** "vandaag", "morgen", "vr" (binnen een week) of "18 okt" */
export function dueLabel(dueDate: string, now = new Date()): string {
  const d = parseDate(dueDate);
  const n = daysBetween(now, d);
  if (n === 0) return "vandaag";
  if (n === 1) return "morgen";
  if (n > 1 && n < 7) return WEEKDAY_SHORT[d.getDay()]!;
  return `${d.getDate()} ${MONTH[d.getMonth()]}`;
}

/** de slechtste status van het lopende huiswerk van een leerling, voor het overzicht */
export function worstStatus(statuses: HomeworkStatus[]): HomeworkStatus | "geen" {
  if (statuses.length === 0) return "geen";
  if (statuses.includes("achter")) return "achter";
  if (statuses.includes("opletten")) return "opletten";
  return "goed";
}

/** waar een stuk staat: "Saxofoon Methode 1 · hoofdstuk 4 · blz. 23 · nr. 12 · track 17" (AC-118) */
export function taskReference(t: { bookTitle: string; chapter: string; page: string; number: string; track: string }): string {
  return [t.bookTitle, t.chapter && `hoofdstuk ${t.chapter}`, t.page && `blz. ${t.page}`, t.number && `nr. ${t.number}`, t.track && `track ${t.track}`]
    .filter(Boolean).join(" · ");
}

/** vaste beginlijst van categorieën in de opdrachtenbank; een leraar kan er eigen bij typen */
export const BASE_CATEGORIES = ["Toonladders", "Etudes", "Liedjes", "Theorie", "Techniek"];

/** de vaste lijst plus de eigen categorieën uit de bank, zonder dubbele (hoofdletters tellen niet) */
export function allCategories(perTask: string[][]): string[] {
  const out = [...BASE_CATEGORIES];
  for (const c of perTask.flat()) {
    const name = c.trim();
    if (name && !out.some((x) => x.toLocaleLowerCase("nl") === name.toLocaleLowerCase("nl"))) out.push(name);
  }
  return out;
}

/** opnames worden 4 weken na de einddatum van het huiswerk verwijderd (AC-118); jjjj-mm-dd */
export const RECORDING_KEEP_DAYS = 28;
export function recordingKeptUntil(dueDate: string): string {
  const d = parseDate(dueDate);
  d.setDate(d.getDate() + RECORDING_KEEP_DAYS);
  return dateKey(d);
}
