import { describe, expect, it } from "vitest";
import { ageProfile, nextNewNote, noteLadder, PlacementTest, placementStart } from "./index.js";

// altsax: geschreven bes3 tot f6, startnoten g4 a4 b4 c5 d5
const range: [string, string] = ["bes3", "f6"];
const starter = ["g4", "a4", "b4", "c5", "d5"];
const ladder = noteLadder(range, starter);

describe("ageProfile", () => {
  it("geeft per leeftijdsgroep de rondelengte, levens, stopwatch en het dagdoel", () => {
    expect(ageProfile("6-8")).toEqual({ roundLength: 5, lives: 4, showTimer: false, dailyGoal: 10 });
    expect(ageProfile("9-12")).toEqual({ roundLength: 8, lives: 3, showTimer: true, dailyGoal: 15 });
    expect(ageProfile("13-17")).toEqual({ roundLength: 8, lives: 3, showTimer: true, dailyGoal: 20 });
    expect(ageProfile("18+")).toEqual({ roundLength: 8, lives: 3, showTimer: true, dailyGoal: 20 });
  });
  it("valt zonder leeftijd terug op het spel van nu (8 noten, 3 levens)", () => {
    expect(ageProfile(null)).toMatchObject({ roundLength: 8, lives: 3, showTimer: true });
  });
});

describe("noteLadder", () => {
  it("begint met de startnoten, dan de stamtonen het dichtst erbij, kruizen en mollen als laatste", () => {
    expect(ladder.slice(0, 5)).toEqual(starter);
    expect(ladder.slice(5, 8)).toEqual(["e5", "f4", "f5"]);
    const firstAltered = ladder.findIndex((n) => /is|es|as|bes/.test(n.slice(0, -1)) && n.length > 2);
    expect(ladder.slice(firstAltered).every((n) => n.length > 2)).toBe(true);
    expect(new Set(ladder).size).toBe(ladder.length);
    expect(ladder).toHaveLength(32);
  });
});

describe("placementStart", () => {
  it("begint bij de startnoten, in het midden of verder naargelang de ervaring; net begonnen = geen toets", () => {
    expect(placementStart("nieuw")).toBeNull();
    expect(placementStart("lt1")).toBe(0);
    expect(placementStart("1-3")).toBe(4);
    expect(placementStart("gt3")).toBe(8);
  });
});

describe("PlacementTest", () => {
  it("vraagt 8 verschillende noten en gaat omhoog bij goed, omlaag bij fout of weet ik niet", () => {
    const t = new PlacementTest(ladder, 0);
    const asked: string[] = [];
    expect(t.current()).toBe("g4");
    t.answer(true); asked.push("g4");
    expect(t.current()).toBe(ladder[2]);
    t.answer(false);
    expect(t.current()).toBe(ladder[1]);
    while (!t.done) { asked.push(t.current()!); t.answer(true); }
    expect(t.asked).toHaveLength(8);
    expect(new Set(t.asked.map((a) => a.note)).size).toBe(8);
  });

  it("uitslag: alle noten tot en met de hoogste goede, behalve wat fout ging", () => {
    const t = new PlacementTest(ladder, 0);
    // g4 goed → b4 fout → a4 goed → d5? (index 3: c5) ...
    const answers = [true, false, true, true, true, false, false, false];
    for (const a of answers) t.answer(a);
    const known = t.result();
    expect(known).toContain("g4");
    expect(known).not.toContain(ladder[2]); // b4 ging fout
    const highestOk = Math.max(...t.asked.filter((a) => a.correct).map((a) => ladder.indexOf(a.note)));
    expect(known.every((n) => ladder.indexOf(n) <= highestOk)).toBe(true);
  });

  it("niets goed: niets bekend", () => {
    const t = new PlacementTest(ladder, 4);
    while (!t.done) t.answer(false);
    expect(t.result()).toEqual([]);
  });
});

describe("nextNewNote", () => {
  it("is de eerste noot op de ladder zonder status", () => {
    expect(nextNewNote(ladder, { g4: "kent", a4: "kent", b4: "kent", c5: "kent", d5: "kent" })).toBe("e5");
    expect(nextNewNote(ladder, {})).toBe("g4");
    expect(nextNewNote(ladder, { g4: "kent", a4: "les" })).toBe("b4");
  });
});
