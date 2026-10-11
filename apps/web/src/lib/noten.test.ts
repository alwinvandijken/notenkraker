import { describe, expect, it } from "vitest";
import { distinctLabels } from "./noten";

describe("distinctLabels", () => {
  it("geeft dubbele namen laag of hoog mee, ten opzichte van de startnoten", () => {
    const starter = ["g4", "a4", "b4", "c5", "d5"];
    expect(distinctLabels(["g4", "a4", "d5", "e5", "f4", "f5", "e4", "g5", "d4"], starter)).toEqual({
      g4: "G", a4: "A", d5: "D", e5: "E hoog", f4: "F laag", f5: "F hoog", e4: "E laag", g5: "G hoog", d4: "D laag",
    });
  });
  it("geeft een naam die drie keer voorkomt laag, gewoon en hoog, ook boven de startnoten", () => {
    const starter = ["g4", "a4", "b4", "c5", "d5"];
    expect(distinctLabels(["es4", "es5", "es6", "e4", "e5", "e6"], starter)).toEqual({
      es4: "Es laag", es5: "Es", es6: "Es hoog", e4: "E laag", e5: "E", e6: "E hoog",
    });
  });
  it("laat een naam die maar één keer voorkomt zonder toevoeging", () => {
    expect(distinctLabels(["g4", "e5"], ["g4"])).toEqual({ g4: "G", e5: "E" });
  });
});
