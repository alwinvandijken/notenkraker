import { describe, expect, it } from "vitest";
import { gainLabel, hardLabel, secondsLabel } from "./spelen";

describe("hardLabel", () => {
  it("foutloos, één lastige noot of meer", () => {
    expect(hardLabel([])).toBe("Foutloos!");
    expect(hardLabel(["E", "E"])).toBe("E was lastig");
    expect(hardLabel(["E", "F", "E", "Fis"])).toBe("E, F en Fis waren lastig");
  });
});

describe("secondsLabel", () => {
  it("seconden met een komma", () => {
    expect(secondsLabel(9420)).toBe("9,4 seconden");
    expect(secondsLabel(61000)).toBe("61,0 seconden");
  });
});

describe("gainLabel", () => {
  it("wat de ronde oplevert voor vandaag", () => {
    expect(gainLabel(2, 7)).toBe("+2 minuten voor vandaag · nog 7");
    expect(gainLabel(1, 0)).toBe("+1 minuut voor vandaag · doel gehaald!");
    expect(gainLabel(0, 3)).toBe("Nog 3 minuten voor vandaag");
  });
});
