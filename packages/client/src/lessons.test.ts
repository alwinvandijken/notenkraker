import { describe, expect, it } from "vitest";
import { lessonEnd, lessonOverview, nextLesson, recordingsPerWeek, weekOf } from "./lessons.js";
import type { GroupLesson, LessonSpan, TaskRecording } from "./types.js";

const span = (lessonId: string, start: string, end: string): LessonSpan => ({ lessonId, start, end });
const rec = (id: string, submittedAt: string): TaskRecording => ({ id, taskId: "a", path: "p", submittedAt, deletedAt: null, reactionEmoji: "", reaction: "", reactedAt: null });

describe("lessonEnd", () => {
  it("de dag vóór de volgende les", () => expect(lessonEnd(["2026-10-06", "2026-10-13"], "2026-10-06")).toBe("2026-10-12"));
  it("zonder volgende les een week", () => expect(lessonEnd(["2026-10-13"], "2026-10-13")).toBe("2026-10-19"));
});

describe("weekOf", () => {
  it("telt de lessen van de opdracht", () => {
    const s = [span("a", "2026-10-06", "2026-10-12"), span("b", "2026-10-13", "2026-10-19")];
    expect(weekOf(s, "a")).toBe(1);
    expect(weekOf(s, "b")).toBe(2);
  });
});

describe("recordingsPerWeek", () => {
  it("groepeert per les, nieuwste week eerst", () => {
    const s = [span("a", "2026-10-06", "2026-10-12"), span("b", "2026-10-13", "2026-10-19")];
    const g = recordingsPerWeek([rec("1", "2026-10-08T10:00:00Z"), rec("2", "2026-10-14T10:00:00Z"), rec("3", "2026-10-09T10:00:00Z")], s);
    expect(g.map((x) => [x.span?.lessonId, x.recordings.map((r) => r.id)])).toEqual([["b", ["2"]], ["a", ["3", "1"]]]);
  });
});
const les = (date: string, status: GroupLesson["status"] = "gepland", more: Partial<GroupLesson> = {}): GroupLesson => ({
  id: date, date, startTime: null, status, reason: "", originalDate: null, endDate: date, notes: [], minutesPerDay: 15, daysPerWeek: 5, remark: "", items: [], ...more,
});
// za 10 okt 2026 is een zaterdag
describe("lessonOverview", () => {
  const za = { weekday: 6, startTime: "10:00" };
  it("toont echte lessen en de komende roosterdagen, nieuwste eerst", () => {
    const rows = lessonOverview([les("2026-10-10")], za, [], "2026-10-13", 2);
    expect(rows.map((r) => `${r.date} ${r.status}`)).toEqual(["2026-10-24 gepland", "2026-10-17 gepland", "2026-10-10 gegeven"]);
    expect(rows[0]!.time).toBe("10:00");
  });
  it("roosterdagen in een vakantie heten vakantie", () => {
    const rows = lessonOverview([], za, [{ id: "h", name: "Herfst", startDate: "2026-10-17", endDate: "2026-10-25" }], "2026-10-13", 3);
    expect(rows.map((r) => `${r.date} ${r.status} ${r.label}`)).toEqual(["2026-10-31 gepland ", "2026-10-24 vakantie Herfst", "2026-10-17 vakantie Herfst"]);
  });
  it("een verzette les vervangt zijn roosterdag; afgezegd blijft staan met reden", () => {
    const rows = lessonOverview([les("2026-10-16", "gepland", { originalDate: "2026-10-17" }), les("2026-10-24", "afgezegd", { reason: "ziek" })], za, [], "2026-10-13", 2);
    expect(rows.map((r) => `${r.date} ${r.status} ${r.label}`)).toEqual(["2026-10-24 afgezegd ziek", "2026-10-16 gepland verzet van za 17 okt"]);
  });
  it("zonder rooster alleen de echte lessen", () => {
    expect(lessonOverview([les("2026-10-20")], { weekday: null, startTime: null }, [], "2026-10-13").map((r) => r.date)).toEqual(["2026-10-20"]);
  });
});

describe("nextLesson", () => {
  it("de eerste geplande les na vandaag", () => {
    const rows = lessonOverview([les("2026-10-13", "gegeven")], { weekday: 2, startTime: null }, [], "2026-10-13", 2);
    expect(nextLesson(rows, "2026-10-13")?.date).toBe("2026-10-20");
  });
});
