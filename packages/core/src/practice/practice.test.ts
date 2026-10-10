import { describe, expect, it } from "vitest";
import { PracticeTracker } from "./index.js";
import type { PitchReading } from "../audio/index.js";

// altsax klinkend: des3 (49) tot as5 (80)
const range = { minMidi: 49, maxMidi: 80 };
const tone = (midi: number, clarity = 0.9): PitchReading => ({ hz: 0, midi, cents: 0, clarity });

/** voer elke 20 ms een lezing in, van `from` tot `to` (ms) */
function feed(t: PracticeTracker, from: number, to: number, reading: (ms: number) => PitchReading | null) {
  for (let ms = from; ms < to; ms += 20) t.push(reading(ms), ms);
}

describe("PracticeTracker", () => {
  it("telt de tijd waarin een vaste toon in het bereik klinkt", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    feed(t, 0, 10_000, () => tone(67));
    const s = t.summary(10_000);
    expect(s.elapsedMs).toBe(10_000);
    expect(s.playedMs).toBeGreaterThan(9_500);
    expect(s.playedMs).toBeLessThanOrEqual(10_000);
  });

  it("telt stilte niet mee, zodat het percentage zakt", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    feed(t, 0, 8_000, () => tone(67));
    feed(t, 8_000, 10_000, () => null);
    const s = t.summary(10_000);
    expect(s.playedMs).toBeGreaterThan(7_500);
    expect(s.playedMs).toBeLessThanOrEqual(8_000);
    expect(s.percent).toBe(Math.round((100 * s.playedMs) / 10_000));
  });

  it("telt geen tonen buiten het bereik van het instrument", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    feed(t, 0, 5_000, () => tone(90));
    feed(t, 5_000, 10_000, () => tone(40));
    expect(t.summary(10_000).playedMs).toBe(0);
  });

  it("telt een wiebelende toonhoogte (praten) niet mee", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    // elke 60 ms een andere toon, zoals bij spraak
    feed(t, 0, 10_000, (ms) => tone(55 + (Math.floor(ms / 60) % 7)));
    expect(t.summary(10_000).playedMs).toBe(0);
    expect(t.state(10_000)).toBe("noise");
  });

  it("telt een onduidelijke toon (lage clarity) niet mee", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    feed(t, 0, 5_000, () => tone(67, 0.3));
    expect(t.summary(5_000).playedMs).toBe(0);
  });

  it("houdt per minuut de gespeelde seconden en de noten bij", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    feed(t, 0, 30_000, () => tone(67));
    feed(t, 30_000, 60_000, () => null);
    feed(t, 60_000, 80_000, () => tone(69));
    feed(t, 80_000, 100_000, () => tone(71));
    const s = t.summary(120_000);
    expect(s.minutes).toHaveLength(2);
    expect(s.minutes[0]!.s).toBeGreaterThanOrEqual(29);
    expect(s.minutes[0]!.s).toBeLessThanOrEqual(30);
    expect(s.minutes[0]!.notes).toEqual([67]);
    expect(s.minutes[1]!.s).toBeGreaterThanOrEqual(39);
    expect(s.minutes[1]!.notes).toEqual([69, 71]);
    expect(s.notes).toEqual([67, 69, 71]);
  });

  it("vult minuten zonder spel aan met 0 seconden", () => {
    const t = new PracticeTracker({ ...range, startMs: 1_000 });
    feed(t, 121_000, 131_000, () => tone(67));
    const s = t.summary(150_000);
    expect(s.minutes.map((m) => m.s > 0)).toEqual([false, false, true]);
  });

  it("zegt wat hij nu hoort: sax, stilte of iets anders", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    expect(t.state(0)).toBe("silent");
    feed(t, 0, 2_000, () => tone(67));
    expect(t.state(2_000)).toBe("playing");
    expect(t.currentMidi(2_000)).toBe(67);
    feed(t, 2_000, 4_000, () => null);
    expect(t.state(4_000)).toBe("silent");
    expect(t.currentMidi(4_000)).toBeNull();
  });

  it("telt een gat in de lezingen (app op de achtergrond) niet mee", () => {
    const t = new PracticeTracker({ ...range, startMs: 0 });
    feed(t, 0, 5_000, () => tone(67));
    feed(t, 65_000, 70_000, () => tone(67)); // een minuut lang geen lezingen
    const s = t.summary(70_000);
    expect(s.playedMs).toBeLessThanOrEqual(10_000);
    expect(s.playedMs).toBeGreaterThan(9_000);
  });
});
