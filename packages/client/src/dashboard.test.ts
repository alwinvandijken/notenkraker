import { describe, expect, it } from "vitest";
import { childSummary, dayDetail, durationLabel, playedOfTotal, whenLabel } from "./dashboard.js";
import type { PracticeSession, Round } from "./types.js";

// Zaterdag 10 oktober 2026, 16:00 lokale tijd
const now = new Date(2026, 9, 10, 16, 0);
const at = (daysAgo: number, hour = 15) => new Date(2026, 9, 10 - daysAgo, hour, 0).toISOString();

function round(daysAgo: number, opts: Partial<Round> = {}): Round {
  return {
    id: `r${daysAgo}${opts.ms ?? ""}`, studentId: "s1", mode: "buttons", ms: 120_000, playedAt: at(daysAgo),
    answers: [{ expected: "g4", given: "g4", correct: true }, { expected: "a4", given: "b4", correct: false }],
    completed: true, mistakes: 1, stars: 2, xp: 10, wrongNotes: ["a4"], ...opts,
  };
}

describe("childSummary", () => {
  const noteIds = ["g4", "a4", "b4", "c5", "d5", "e5"];
  const statuses = { g4: "kent", a4: "kent", b4: "les", e5: "moet" } as const;

  it("telt oefenminuten per dag voor de laatste 7 dagen, vandaag als laatste", () => {
    const s = childSummary({ rounds: [round(0), round(0, { id: "x", ms: 60_000 }), round(2)], statuses, noteIds, now });
    expect(s.days.map((d) => d.minutes)).toEqual([0, 0, 0, 0, 2, 0, 3]);
    expect(s.days.map((d) => d.label)).toEqual(["zo", "ma", "di", "wo", "do", "vr", "za"]);
  });

  it("geeft een ronde van minder dan een minuut toch 1 minuut", () => {
    expect(childSummary({ rounds: [round(0, { ms: 20_000 })], statuses, noteIds, now }).days[6]!.minutes).toBe(1);
  });

  it("telt dagen op rij tot vandaag, of tot gisteren als er vandaag nog niet geoefend is", () => {
    expect(childSummary({ rounds: [round(0), round(1), round(2), round(4)], statuses, noteIds, now }).streak).toBe(3);
    expect(childSummary({ rounds: [round(1), round(2)], statuses, noteIds, now }).streak).toBe(2);
    expect(childSummary({ rounds: [round(2)], statuses, noteIds, now }).streak).toBe(0);
  });

  it("weet hoeveel dagen geleden er geoefend is", () => {
    expect(childSummary({ rounds: [round(3), round(5)], statuses, noteIds, now }).daysSinceLast).toBe(3);
    expect(childSummary({ rounds: [], statuses, noteIds, now }).daysSinceLast).toBeNull();
  });

  it("telt de noten: kent al, in de les en wat nog komt", () => {
    const s = childSummary({ rounds: [], statuses, noteIds, now });
    expect(s.notes).toEqual({ kent: 2, les: 1, nog: 3, total: 6 });
    expect(s.lesNotes).toEqual(["b4"]);
  });

  it("noemt de lastigste noten van deze week, de vaakst foute eerst, hooguit 3", () => {
    const rounds = [
      round(0, { wrongNotes: ["a4", "d5"] }), round(1, { wrongNotes: ["a4"] }), round(2, { wrongNotes: ["c5", "e5", "b4"] }),
      round(9, { wrongNotes: ["g4", "g4", "g4"] }), // ouder dan 7 dagen: telt niet
    ];
    expect(childSummary({ rounds, statuses, noteIds, now }).weak).toEqual([
      { noteId: "a4", wrong: 2 }, { noteId: "b4", wrong: 1 }, { noteId: "c5", wrong: 1 },
    ]);
  });

  it("vat de week samen: rondes en minuten van de laatste 7 dagen", () => {
    const s = childSummary({ rounds: [round(0), round(6), round(7)], statuses, noteIds, now });
    expect(s.week).toEqual({ rounds: 2, minutes: 4 });
  });
});

function session(daysAgo: number, playedMin: number, totalMin: number, opts: Partial<PracticeSession> = {}): PracticeSession {
  const start = at(daysAgo, 17);
  return {
    id: `p${daysAgo}${playedMin}`, studentId: "s1", startedAt: start, endedAt: new Date(Date.parse(start) + totalMin * 60_000).toISOString(),
    done: true, playedSeconds: playedMin * 60, minutes: [], notes: ["g4", "a4"], label: "sax", ...opts,
  };
}

describe("childSummary met vrij oefenen", () => {
  const noteIds = ["g4", "a4"];

  it("telt per dag spelletjes en vrij oefenen apart, en samen", () => {
    const s = childSummary({ rounds: [round(0)], sessions: [session(0, 16, 20), session(2, 8, 10)], statuses: {}, noteIds, now });
    expect(s.days[6]).toMatchObject({ game: 2, free: 16, minutes: 18 });
    expect(s.days[4]).toMatchObject({ game: 0, free: 8, minutes: 8 });
    expect(s.week.minutes).toBe(26);
  });

  it("geeft per sessie de gespeelde minuten, de duur en het percentage", () => {
    const s = childSummary({ rounds: [], sessions: [session(0, 16, 20), session(3, 2, 40, { label: "twijfel" })], statuses: {}, noteIds, now });
    expect(s.sessions).toEqual([
      expect.objectContaining({ playedMinutes: 16, totalMinutes: 20, percent: 80, label: "sax" }),
      expect.objectContaining({ playedMinutes: 2, totalMinutes: 40, percent: 5, label: "twijfel" }),
    ]);
  });

  it("telt een dag met alleen vrij oefenen mee voor dagen op rij en laatst geoefend", () => {
    const s = childSummary({ rounds: [round(1)], sessions: [session(0, 10, 12)], statuses: {}, noteIds, now });
    expect(s.streak).toBe(2);
    expect(s.daysSinceLast).toBe(0);
  });

  it("telt een sessie zonder gespeelde tijd niet als geoefend", () => {
    const s = childSummary({ rounds: [], sessions: [session(0, 0, 5)], statuses: {}, noteIds, now });
    expect(s.daysSinceLast).toBeNull();
    expect(s.days[6]!.free).toBe(0);
  });
});

describe("childSummary: geschiedenis", () => {
  it("geeft 28 dagen oefentijd, oudste eerst, met datum en label", () => {
    const s = childSummary({ rounds: [round(0), round(20)], sessions: [session(10, 5, 6)], statuses: {}, noteIds: [], now });
    expect(s.history).toHaveLength(28);
    expect(s.history[27]).toMatchObject({ date: "2026-10-10", label: "za 10", game: 2, free: 0 });
    expect(s.history[17]).toMatchObject({ date: "2026-09-30", free: 5 });
    expect(s.history[7]).toMatchObject({ date: "2026-09-20", game: 2 });
  });

  it("geeft per sessie de seconden per minuut mee", () => {
    const s = childSummary({ rounds: [], sessions: [session(0, 1, 2, { minutes: [{ s: 40, notes: [] }, { s: 20, notes: [] }] })], statuses: {}, noteIds: [], now });
    expect(s.sessions[0]!.perMinute).toEqual([40, 20]);
    expect(s.sessions[0]).toMatchObject({ playedSeconds: 60, totalSeconds: 120 });
  });
});

describe("durationLabel", () => {
  it("toont korte tijden in seconden en langere in minuten", () => {
    expect(durationLabel(12)).toBe("12 s");
    expect(durationLabel(59)).toBe("59 s");
    expect(durationLabel(60)).toBe("1 min");
    expect(durationLabel(16 * 60 + 20)).toBe("16 min");
  });
  it("zet gespeeld en totaal in dezelfde eenheid: \"12 van 13 s\", \"16 van 22 min\"", () => {
    expect(playedOfTotal(12, 13)).toBe("12 van 13 s");
    expect(playedOfTotal(40, 90)).toBe("40 s van 2 min");
    expect(playedOfTotal(960, 1320)).toBe("16 van 22 min");
  });
});

describe("dayDetail", () => {
  it("geeft alle sessies en rondes van één dag, op tijd", () => {
    const rounds = [round(0, { id: "a", playedAt: at(0, 9) }), round(1, { id: "b" })];
    const sessions = [session(0, 10, 12)];
    const d = dayDetail({ rounds, sessions, date: "2026-10-10" });
    expect(d.items.map((i) => i.kind)).toEqual(["spel", "vrij"]);
    expect(d.items[0]).toMatchObject({ kind: "spel", correct: 1, total: 2, minutes: 2, stars: 2 });
    expect(d.items[1]).toMatchObject({ kind: "vrij", playedMinutes: 10, totalMinutes: 12 });
    expect(d).toMatchObject({ game: 2, free: 10 });
  });
});

describe("whenLabel", () => {
  it("zegt vandaag met tijd, gisteren, een weekdag of een datum", () => {
    expect(whenLabel(at(0, 15), now)).toBe("vandaag 15:00");
    expect(whenLabel(at(1), now)).toBe("gisteren");
    expect(whenLabel(at(3), now)).toBe("woensdag");
    expect(whenLabel(at(9), now)).toBe("1 okt");
  });
});
