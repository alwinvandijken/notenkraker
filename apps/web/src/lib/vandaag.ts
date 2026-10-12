import type { HomeworkTask } from "@notenkraker/client";
import type { NoteId, StatusMap } from "@notenkraker/core";
import type { CurrentHomework } from "@/components/Huiswerk";

/**
 * Vandaag (AC-120, mock-up docs/ux-review/vandaag.html): al het lopende huiswerk van ouder en
 * leraar als één takenlijst, en welke taak de oranje knop start.
 */
export type VandaagRow =
  /** de minuten oefenen; spelen en vrij spelen tellen mee */
  | { kind: "minuten"; key: string; goal: number; today: number; doneDays: number; goalDays: number; notes: NoteId[]; done: boolean }
  /** af te vinken opdracht */
  | { kind: "opdracht"; key: string; task: HomeworkTask; done: boolean }
  /** stuk om op te nemen en in te sturen */
  | { kind: "opname"; key: string; task: HomeworkTask; done: boolean }
  /** stuk om te spelen (een opdracht uit de bank, of het oude veld "stuk" van het huiswerk) */
  | { kind: "stuk"; key: string; title: string; detail: string; task?: HomeworkTask };

export type VandaagNext = { kind: "opname"; task: HomeworkTask } | { kind: "spelen" };

export interface VandaagPlan {
  /** minuten per dag: het hoogste doel, want dezelfde minuten tellen voor elk huiswerk */
  goal: number;
  today: number;
  givers: string[];
  /** de eerste einddatum */
  due: string;
  rows: VandaagRow[];
  /** wat de oranje knop start; null als er niets meer te starten is */
  next: VandaagNext | null;
  /** vandaag al iets gedaan: de knop heet dan "Verder oefenen" */
  started: boolean;
  allDone: boolean;
}

export function planVandaag(items: CurrentHomework[], { mayRecord }: { mayRecord: boolean }): VandaagPlan | null {
  if (items.length === 0) return null;
  const main = items.reduce((a, b) => (b.h.minutesPerDay > a.h.minutesPerDay ? b : a));
  const goal = main.h.minutesPerDay;
  const today = Math.max(...items.map((x) => x.p.todayMinutes));
  const notes = [...new Set(items.flatMap((x) => x.h.notes))];

  const rows: VandaagRow[] = [
    { kind: "minuten", key: "minuten", goal, today, doneDays: main.p.doneDays, goalDays: main.p.goalDays, notes, done: today >= goal },
  ];
  for (const { h } of items) {
    if (h.piece) rows.push({ kind: "stuk", key: `${h.id}-stuk`, title: h.piece, detail: h.pieceNote });
    for (const t of h.tasks) {
      if (t.recording) rows.push({ kind: "opname", key: t.id, task: t, done: !!t.submittedAt });
      else if (t.kind === "opdracht") rows.push({ kind: "opdracht", key: t.id, task: t, done: !!t.doneAt });
      else rows.push({ kind: "stuk", key: t.id, title: t.title, detail: "", task: t });
    }
  }

  const openRecording = mayRecord ? rows.find((r) => r.kind === "opname" && !r.done) : undefined;
  const next: VandaagNext | null = openRecording?.kind === "opname" ? { kind: "opname", task: openRecording.task }
    : today < goal ? { kind: "spelen" } : null;
  return {
    goal, today, rows, next,
    givers: [...new Set(items.map((x) => x.h.givenByName))],
    due: items.map((x) => x.h.dueDate).sort()[0]!,
    started: today > 0 || rows.some((r) => r.kind !== "minuten" && r.kind !== "stuk" && r.done),
    allDone: rows.every((r) => r.kind === "stuk" || r.done),
  };
}

/** "Marieke", "Marieke en papa", "Marieke, papa en Joost" */
export function namesLabel(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} en ${names.at(-1)}`;
}

/** zonder huiswerk: één voorstel uit de noten die je leert */
export function suggestion(statuses: StatusMap, labels: Record<string, string>): { text: string; mode: "game" | "learn" } {
  const les = Object.keys(statuses).filter((n) => statuses[n] === "les");
  if (les.length) return { text: `Speel 5 minuten het notenspel met ${namesLabel(les.slice(0, 4).map((n) => labels[n] ?? n))}.`, mode: "game" };
  const kent = Object.keys(statuses).filter((n) => statuses[n] === "kent").length;
  if (kent) return { text: `Speel 5 minuten het notenspel met de ${kent} ${kent === 1 ? "noot" : "noten"} die je kent.`, mode: "game" };
  return { text: "Kijk bij Grepen welke kleppen bij een noot horen.", mode: "learn" };
}
