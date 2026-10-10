import { describe, expect, it } from "vitest";
import { instrumentNotes, primaryFingering, validateInstrument } from "@notenkraker/core";
import { INSTRUMENTS, getInstrument } from "./index.js";

describe("instrumentpakketten", () => {
  for (const inst of INSTRUMENTS) {
    it(`${inst.id}: elke noot in het bereik heeft een geldige greep`, () => {
      expect(validateInstrument(inst)).toEqual([]);
    });
  }
  it("altsax: 32 noten, g4 = 1-2-3, fis4 = 1-2-3 + 5, cis5 = open, gis4 gebruikt G#-klep", () => {
    const sax = getInstrument("altsax");
    expect(instrumentNotes(sax).length).toBe(32);
    expect(primaryFingering(sax, "g4")).toEqual(["L1", "L2", "L3"]);
    expect(primaryFingering(sax, "fis4")).toEqual(["L1", "L2", "L3", "R5"]);
    expect(primaryFingering(sax, "cis5")).toEqual([]);
    expect(primaryFingering(sax, "gis4")).toContain("gs");
    // de linkerpink heeft op dit model twee kleppen: lage cis/b/bes komen op 'low'
    expect(primaryFingering(sax, "b3")).toContain("low");
  });
});
