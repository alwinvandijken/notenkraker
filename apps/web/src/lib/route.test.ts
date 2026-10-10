import { describe, expect, it } from "vitest";
import { appFor, chooseRoute, importableNotes, markImportAsked, offerImport, redirectFor } from "./route";

function memory(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  };
}

describe("appFor", () => {
  it("kiest de welkomstpagina, de route zonder account of de app met account", () => {
    expect(appFor("/")).toBe("welkom");
    expect(appFor("/oefenen")).toBe("anoniem");
    expect(appFor("/oefenen/")).toBe("anoniem");
    expect(appFor("/app")).toBe("account");
    expect(appFor("/onbekend")).toBe("welkom");
  });
});

describe("redirectFor en chooseRoute", () => {
  it("toont de welkomstpagina zolang 'niet meer tonen' niet is aangevinkt", () => {
    const s = memory();
    chooseRoute(s, "oefenen", false);
    expect(redirectFor("/", "", s)).toBeNull();
  });

  it("gaat met 'niet meer tonen' direct naar de laatst gekozen route", () => {
    const s = memory();
    chooseRoute(s, "oefenen", true);
    expect(redirectFor("/", "", s)).toBe("/oefenen");
    chooseRoute(s, "app", true);
    expect(redirectFor("/", "", s)).toBe("/app");
  });

  it("toont de welkomstpagina altijd via het menu (?welkom)", () => {
    const s = memory();
    chooseRoute(s, "app", true);
    expect(redirectFor("/", "?welkom", s)).toBeNull();
  });

  it("stuurt andere adressen nooit door", () => {
    const s = memory();
    chooseRoute(s, "app", true);
    expect(redirectFor("/oefenen", "", s)).toBeNull();
  });

  it("zet 'niet meer tonen' weer uit als het vinkje uit staat", () => {
    const s = memory();
    chooseRoute(s, "app", true);
    chooseRoute(s, "app", false);
    expect(redirectFor("/", "", s)).toBeNull();
  });
});

describe("noten overnemen naar een nieuw account", () => {
  const anoniem = JSON.stringify({
    students: [{ id: "x", name: "Ik" }],
    notes: [{ studentId: "x", noteId: "g4", status: "kent" }, { studentId: "x", noteId: "a4", status: "les" }],
  });

  it("vindt de noten die zonder account op dit apparaat staan", () => {
    expect(importableNotes(memory({ "nk-anoniem": anoniem }))).toEqual([{ noteId: "g4", status: "kent" }, { noteId: "a4", status: "les" }]);
    expect(importableNotes(memory())).toEqual([]);
    expect(importableNotes(memory({ "nk-anoniem": "kapot" }))).toEqual([]);
  });

  it("neemt alleen de noten van het eerste profiel, ook als er per ongeluk twee zijn", () => {
    const twee = JSON.stringify({
      students: [{ id: "x" }, { id: "y" }],
      notes: [{ studentId: "x", noteId: "g4", status: "kent" }, { studentId: "y", noteId: "g4", status: "kent" }, { studentId: "y", noteId: "b4", status: "les" }],
    });
    expect(importableNotes(memory({ "nk-anoniem": twee }))).toEqual([{ noteId: "g4", status: "kent" }]);
  });

  it("vraagt het alleen als het account nog geen noten heeft en er iets over te nemen is", () => {
    const s = memory({ "nk-anoniem": anoniem });
    expect(offerImport(s, 0)).toBe(true);
    expect(offerImport(s, 3)).toBe(false);
    expect(offerImport(memory(), 0)).toBe(false);
  });

  it("vraagt het maar één keer", () => {
    const s = memory({ "nk-anoniem": anoniem });
    markImportAsked(s);
    expect(offerImport(s, 0)).toBe(false);
  });
});
