import { describe, expect, it } from "vitest";
import {
  chromaticRange, detectPitch, idToMidi, ledgerLines, makeSequence, midiToFrequency, NoteMatcher,
  noteName, parseId, promotionCandidates, scoreRound, soundingMidi, staffPosition, synthBuffer, toId, weightedPool,
} from "./index.js";

describe("noot-ids en midi", () => {
  it("parseert Nederlandse namen", () => {
    expect(parseId("fis4")).toEqual({ letter: "f", accidental: "#", octave: 4 });
    expect(parseId("bes3")).toEqual({ letter: "b", accidental: "b", octave: 3 });
    expect(parseId("es5")).toEqual({ letter: "e", accidental: "b", octave: 5 });
    expect(parseId("as4")).toEqual({ letter: "a", accidental: "b", octave: 4 });
    expect(() => parseId("h4")).toThrow();
  });
  it("c4 = 60, a4 = 69, bes3 = 58", () => {
    expect(idToMidi("c4")).toBe(60);
    expect(idToMidi("a4")).toBe(69);
    expect(idToMidi("bes3")).toBe(58);
    expect(idToMidi("fis4")).toBe(66);
  });
  it("rondreis id → pitch → id", () => {
    for (const id of ["c4", "cis4", "es4", "fis5", "bes3", "f6"]) expect(toId(parseId(id))).toBe(id);
  });
  it("namen in NL en EN", () => {
    expect(noteName(parseId("fis4"), "nl")).toBe("fis");
    expect(noteName(parseId("fis4"), "en")).toBe("F♯");
    expect(noteName(parseId("bes4"), "en")).toBe("B♭");
  });
});

describe("altsax-transpositie", () => {
  it("geschreven c5 klinkt als es4 (midi 63)", () => {
    expect(soundingMidi("c5", -9)).toBe(63);
  });
  it("a4 = 440 Hz, klinkende altsax-a4 ≈ 261.6 Hz", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 5);
    expect(midiToFrequency(soundingMidi("a4", -9))).toBeCloseTo(261.63, 1);
  });
});

describe("notenbalk", () => {
  it("G-sleutel: e4 op de onderste lijn, f5 op de bovenste, c4 op eerste hulplijn", () => {
    expect(staffPosition(parseId("e4"), "G")).toBe(0);
    expect(staffPosition(parseId("f5"), "G")).toBe(8);
    expect(staffPosition(parseId("c4"), "G")).toBe(-2);
    expect(ledgerLines(-2)).toEqual([-2]);
    expect(ledgerLines(-3)).toEqual([-2]);
    expect(ledgerLines(14)).toEqual([10, 12, 14]);
  });
  it("F-sleutel: g2 onderste lijn", () => {
    expect(staffPosition(parseId("g2"), "F")).toBe(0);
    expect(staffPosition(parseId("c4"), "F")).toBe(10);
  });
  it("chromatisch bereik altsax = 32 noten", () => {
    const r = chromaticRange("bes3", "f6");
    expect(r.length).toBe(32);
    expect(r[0]).toBe("bes3");
    expect(r).toContain("fis4");
    expect(r).toContain("es5");
    expect(r[r.length - 1]).toBe("f6");
  });
});

describe("spel", () => {
  it("pool weegt les/moet 3x", () => {
    const pool = weightedPool({ g4: "kent", fis4: "les" }, []);
    expect(pool.filter((n) => n === "fis4").length).toBe(3);
    expect(pool.filter((n) => n === "g4").length).toBe(1);
  });
  it("reeks vermijdt herhaling waar mogelijk", () => {
    let i = 0; const rng = () => [0.1, 0.1, 0.9, 0.9, 0.1][i++ % 5]!;
    const seq = makeSequence(["a4", "b4"], 4, rng);
    for (let k = 1; k < seq.length; k++) expect(seq[k]).not.toBe(seq[k - 1]);
  });
  it("sterren en xp", () => {
    const ok = (n: string) => ({ expected: n, given: n, correct: true });
    const bad = (n: string) => ({ expected: n, given: "x", correct: false });
    const perfect = scoreRound({ mode: "buttons", lives: 3, ms: 1000, answers: [ok("g4"), ok("fis4")] }, { fis4: "les" });
    expect(perfect).toMatchObject({ completed: true, stars: 3, xp: 10 + 20 + 50, mistakes: 0 });
    const one = scoreRound({ mode: "buttons", lives: 3, ms: 1000, answers: [ok("g4"), bad("fis4")] });
    expect(one.stars).toBe(2);
    expect(one.wrongNotes).toEqual(["fis4"]);
    const dead = scoreRound({ mode: "buttons", lives: 3, ms: 1000, answers: [bad("a"), bad("b"), bad("c")] });
    expect(dead).toMatchObject({ completed: false, stars: 0 });
  });
  it("promotie na 3 foutloze rondes", () => {
    const r = { answers: [{ expected: "fis4", given: "fis4", correct: true }] };
    expect(promotionCandidates({ fis4: "les" }, [r, r, r])).toEqual(["fis4"]);
    expect(promotionCandidates({ fis4: "les" }, [r, r])).toEqual([]);
  });
});

describe("toonherkenning", () => {
  const sr = 44100;
  it("herkent klinkende altsax-noten uit een synthbuffer", () => {
    for (const id of ["g4", "fis4", "d5", "f6", "bes3"]) {
      const midi = soundingMidi(id, -9);
      const buf = synthBuffer(midiToFrequency(midi), sr, 4096);
      const r = detectPitch(buf, { sampleRate: sr });
      expect(r, id).not.toBeNull();
      expect(r!.midi, id).toBe(midi);
      expect(Math.abs(r!.cents), id).toBeLessThan(15);
    }
  });
  it("stilte geeft null", () => {
    expect(detectPitch(new Float32Array(4096), { sampleRate: sr })).toBeNull();
  });
  it("matcher: goed na 250 ms, fout pas na 1200 ms", () => {
    const m = new NoteMatcher({ expectedMidi: 63 });
    const good = { hz: 0, midi: 63, cents: 5, clarity: 1 };
    expect(m.push(good, 0)).toBeNull();
    expect(m.push(good, 100)).toBeNull();
    expect(m.push(good, 260)).toEqual({ type: "correct" });
    expect(m.push(good, 300)).toBeNull(); // al gevuurd
    const w = new NoteMatcher({ expectedMidi: 63 });
    const wrong = { hz: 0, midi: 64, cents: 0, clarity: 1 };
    expect(w.push(wrong, 0)).toBeNull();
    expect(w.push(wrong, 1000)).toBeNull();
    expect(w.push(wrong, 1250)).toEqual({ type: "wrong", midi: 64 });
  });
});
