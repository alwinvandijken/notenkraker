import { dateKey } from "./dashboard.js";
import type { GroupLesson, Holiday, Lesson, LessonSpan, LessonStatus, OverviewRow, Schedule, TaskRecording } from "./types.js";

/**
 * Les en huiswerkperiode (AC-124): een les loopt tot de dag vóór de volgende les van de groep, anders een
 * week. Een opdracht die meegaat staat in meer lessen; de week is zijn plek daartussen.
 */
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d); };

export function lessonEnd(lessonDates: string[], date: string): string {
  const next = lessonDates.filter((d) => d > date).sort()[0];
  return next ? addDays(next, -1) : addDays(date, 6);
}

/** 1 = de eerste les waarin de opdracht staat; 0 als de les er niet bij is */
export function weekOf(spans: LessonSpan[], lessonId: string): number {
  return [...spans].sort((a, b) => a.start.localeCompare(b.start)).findIndex((s) => s.lessonId === lessonId) + 1;
}

/** opnames per week (de les in wiens periode ze vallen), nieuwste week eerst en binnen een week nieuwste eerst */
export function recordingsPerWeek(recordings: TaskRecording[], spans: LessonSpan[]): Array<{ span: LessonSpan | null; recordings: TaskRecording[] }> {
  const sorted = [...spans].sort((a, b) => b.start.localeCompare(a.start));
  const groups = new Map<LessonSpan | null, TaskRecording[]>();
  for (const r of [...recordings].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))) {
    const day = dateKey(new Date(r.submittedAt));
    const span = sorted.find((s) => s.start <= day && day <= s.end) ?? null;
    groups.set(span, [...(groups.get(span) ?? []), r]);
  }
  return [...sorted, null].filter((s) => groups.has(s)).map((span) => ({ span, recordings: groups.get(span)! }));
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const short = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export function isRunning(h: { status: LessonStatus }): boolean { return h.status === "gepland" || h.status === "gegeven"; }

/**
 * Het lessenoverzicht van een groep (stap 2): de echte lessen, plus de komende roosterdagen (gepland) en
 * roosterdagen in een vakantie. Een verzette les vervangt zijn roosterdag. Nieuwste eerst.
 */
export function lessonOverview(lessons: GroupLesson[], schedule: Schedule, holidays: Holiday[], today: string, weeksAhead = 8): OverviewRow[] {
  const holidayOn = (d: string) => holidays.find((h) => h.startDate <= d && d <= h.endDate);
  const rows: OverviewRow[] = lessons.map((l) => ({
    date: l.date, time: l.startTime, lesson: l,
    status: l.status === "afgezegd" || l.status === "gestopt" ? l.status : l.date <= today ? "gegeven" : "gepland",
    label: l.status === "afgezegd" ? l.reason : l.originalDate && l.originalDate !== l.date ? `verzet van ${short(l.originalDate)}` : "",
  }));
  if (schedule.weekday !== null) {
    const taken = new Set(lessons.flatMap((l) => [l.date, l.originalDate ?? l.date]));
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + ((schedule.weekday - d.getDay() + 7) % 7 || 7));
    for (let i = 0; i < weeksAhead; i++, d.setDate(d.getDate() + 7)) {
      const iso = dateKey(d);
      if (taken.has(iso)) continue;
      const h = holidayOn(iso);
      rows.push({ date: iso, time: schedule.startTime, lesson: null, status: h ? "vakantie" : "gepland", label: h ? h.name : "" });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** de eerstvolgende les die doorgaat, na vandaag */
export function nextLesson(rows: OverviewRow[], today: string): OverviewRow | null {
  return [...rows].reverse().find((r) => r.status === "gepland" && r.date > today) ?? null;
}

/**
 * De les waar huiswerk voor "deze" of "volgende" les heen gaat, en zijn periode, zoals de database hem kiest
 * (lesson_for, next_lesson_day): vakanties, afgezegde en verzette lessen tellen mee. Zonder rooster: vandaag of over een week.
 */
export function plannedLesson(lessons: GroupLesson[], schedule: Schedule, holidays: Holiday[], which: Lesson, today: string): { lesson: GroupLesson | null; start: string; due: string } {
  const running = lessons.filter(isRunning).sort((a, b) => a.date.localeCompare(b.date));
  const lesson = which === "deze"
    ? running.filter((l) => l.date <= today && l.endDate >= today).at(-1)
    : running.find((l) => l.date > today);
  if (lesson) return { lesson, start: lesson.date, due: lesson.endDate };
  /** de dagen waarop een les doorgaat: echte lessen en roosterdagen buiten de vakantie */
  const goes = lessonOverview(lessons, schedule, holidays, today, 12).filter((r) => r.status === "gepland" || r.status === "gegeven").map((r) => r.date).sort();
  const back = schedule.weekday === null ? 0 : (new Date(`${today}T12:00:00`).getDay() - schedule.weekday + 7) % 7;
  const start = which === "deze" ? addDays(today, -back) : (schedule.weekday === null ? addDays(today, 7) : goes.find((d) => d > today) ?? addDays(today, 7));
  const after = goes.find((d) => d > start);
  return { lesson: null, start, due: after ? addDays(after, -1) : addDays(start, 6) };
}
