import { describe, expect, it } from "vitest";
import type { Homework, HomeworkProgress, HomeworkTask } from "@notenkraker/client";
import { planVandaag, suggestion } from "./vandaag";

const progress = (todayMinutes: number, p: Partial<HomeworkProgress> = {}): HomeworkProgress =>
  ({ days: [], goalDays: 5, doneDays: 2, daysLeft: 3, todayMinutes, status: "goed", ...p });
const task = (t: Partial<HomeworkTask>): HomeworkTask => ({
  id: "t", homeworkId: "h", position: 0, kind: "opdracht", title: "Taak", bookTitle: "", bookAuthor: "", page: "", chapter: "", number: "", track: "",
  doneAt: null, sheetPath: null, sheetName: "", examplePath: null, recording: false, recordingPath: null, submittedAt: null, recordingDeletedAt: null,
  reactionEmoji: "", reaction: "", reactedAt: null, ...t,
});
const hw = (h: Partial<Homework>): Homework => ({
  id: "h", studentId: "s", givenBy: "u", givenByRole: "leraar", givenByName: "Marieke", createdAt: "2026-10-10T10:00:00Z", dueDate: "2026-10-17",
  minutesPerDay: 15, daysPerWeek: 5, notes: [], piece: "", pieceNote: "", remark: "", tasks: [], ...h,
});

describe("planVandaag", () => {
  it("zonder huiswerk: geen plan", () => {
    expect(planVandaag([], { mayRecord: true })).toBeNull();
  });

  it("voegt het huiswerk van ouder en leraar samen tot één takenlijst", () => {
    const plan = planVandaag([
      { h: hw({ id: "a", givenByName: "Marieke", notes: ["g4"], tasks: [task({ id: "op", kind: "stuk", title: "Lang zal ze leven", recording: true })] }), p: progress(6) },
      { h: hw({ id: "b", givenByName: "papa", givenByRole: "ouder", minutesPerDay: 10, dueDate: "2026-10-15", notes: ["a4", "g4"], tasks: [task({ id: "ab", title: "Notenalfabet achteruit", doneAt: "2026-10-11" })] }), p: progress(6) },
    ], { mayRecord: true })!;
    expect(plan.goal).toBe(15);
    expect(plan.today).toBe(6);
    expect(plan.givers).toEqual(["Marieke", "papa"]);
    expect(plan.due).toBe("2026-10-15");
    expect(plan.rows.map((r) => r.kind)).toEqual(["minuten", "opname", "opdracht"]);
    expect(plan.rows[0]).toMatchObject({ kind: "minuten", goal: 15, notes: ["g4", "a4"], done: false });
    expect(plan.rows[2]).toMatchObject({ done: true });
  });

  it("de knop start de eerstvolgende open taak: eerst opnemen", () => {
    const op = task({ id: "op", kind: "stuk", recording: true });
    const plan = planVandaag([{ h: hw({ tasks: [op] }), p: progress(0) }], { mayRecord: true })!;
    expect(plan.next).toEqual({ kind: "opname", task: op });
    expect(plan.started).toBe(false);
  });

  it("staat alleen de minuten nog open, dan start de knop Spelen", () => {
    const plan = planVandaag([{ h: hw({ tasks: [task({ id: "op", kind: "stuk", recording: true, submittedAt: "2026-10-12" })] }), p: progress(4) }], { mayRecord: true })!;
    expect(plan.next).toEqual({ kind: "spelen" });
    expect(plan.started).toBe(true);
  });

  it("opnemen zonder toestemming slaat de knop over", () => {
    const plan = planVandaag([{ h: hw({ tasks: [task({ kind: "stuk", recording: true })] }), p: progress(0) }], { mayRecord: false })!;
    expect(plan.next).toEqual({ kind: "spelen" });
  });

  it("alles af: geen volgende taak", () => {
    const plan = planVandaag([{ h: hw({ tasks: [task({ doneAt: "2026-10-12" })] }), p: progress(15) }], { mayRecord: true })!;
    expect(plan.next).toBeNull();
    expect(plan.allDone).toBe(true);
  });

  it("een stuk zonder opname is een regel om te spelen, niet om af te vinken", () => {
    const plan = planVandaag([{ h: hw({ piece: "Oude stuk", tasks: [task({ kind: "stuk", title: "Etude" })] }), p: progress(15) }], { mayRecord: true })!;
    expect(plan.rows.map((r) => r.kind)).toEqual(["minuten", "stuk", "stuk"]);
    expect(plan.allDone).toBe(true);
  });
});

describe("suggestion", () => {
  const labels = { g4: "G", a4: "A", b4: "B", c5: "C" };
  it("noten in de les: het notenspel met die noten", () => {
    expect(suggestion({ g4: "les", a4: "les", b4: "kent" }, labels)).toEqual({ text: "Speel 5 minuten het notenspel met G en A.", mode: "game" });
  });
  it("alleen noten die je kent: het notenspel om ze vast te houden", () => {
    expect(suggestion({ g4: "kent", a4: "kent", b4: "kent", c5: "kent" }, labels)).toEqual({ text: "Speel 5 minuten het notenspel met de 4 noten die je kent.", mode: "game" });
  });
  it("nog geen noten: eerst Grepen", () => {
    expect(suggestion({}, labels)).toEqual({ text: "Kijk bij Grepen welke kleppen bij een noot horen.", mode: "learn" });
  });
});
