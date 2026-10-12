import { dateKey } from "./dashboard.js";
import type { LessonSpan, TaskRecording } from "./types.js";

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
