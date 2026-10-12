import { describe, expect, it } from "vitest";
import { lessonEnd, recordingsPerWeek, weekOf } from "./lessons.js";
import type { LessonSpan, TaskRecording } from "./types.js";

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
