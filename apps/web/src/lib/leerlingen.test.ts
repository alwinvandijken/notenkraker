import { describe, expect, it } from "vitest";
import { filterRows, sortRows, type TableRow } from "./leerlingen";

const row = (name: string, opts: Partial<TableRow> = {}): TableRow => ({
  id: name, name, weekMinutes: 0, goalMinutes: null, status: "geen", due: null, known: 0, daysSinceLast: null, others: [], ...opts,
});
const rows = [
  row("Sem", { status: "achter", weekMinutes: 15, daysSinceLast: 5, known: 5 }),
  row("annabel", { status: "goed", weekMinutes: 118, daysSinceLast: 0, known: 14 }),
  row("Daan", { status: "geen" }),
  row("Noor", { status: "opletten", weekMinutes: 40, daysSinceLast: 2, known: 6 }),
];

describe("sortRows", () => {
  it("zet standaard wie achterloopt bovenaan, daarna opletten, geen huiswerk en gaat goed", () => {
    expect(sortRows(rows, "status", "asc").map((r) => r.name)).toEqual(["Sem", "Noor", "Daan", "annabel"]);
  });
  it("sorteert op naam zonder op hoofdletters te letten", () => {
    expect(sortRows(rows, "name", "asc").map((r) => r.name)).toEqual(["annabel", "Daan", "Noor", "Sem"]);
  });
  it("sorteert op oefentijd, meeste eerst als je omdraait", () => {
    expect(sortRows(rows, "weekMinutes", "desc").map((r) => r.name)).toEqual(["annabel", "Noor", "Sem", "Daan"]);
  });
  it("zet wie nog nooit oefende achteraan bij laatst geoefend", () => {
    expect(sortRows(rows, "daysSinceLast", "asc").map((r) => r.name)).toEqual(["annabel", "Noor", "Sem", "Daan"]);
  });
});

describe("filterRows", () => {
  it("filtert op status en zoekt op naam", () => {
    expect(filterRows(rows, "achter", "").map((r) => r.name)).toEqual(["Sem"]);
    expect(filterRows(rows, "alle", "no").map((r) => r.name)).toEqual(["Noor"]);
    expect(filterRows(rows, "alle", "").length).toBe(4);
  });
});
