import { noteName, parseId, type NoteId } from "@notenkraker/core";

/** Namen van noten zoals de app ze toont: "G", "C hoog". Gedeeld door grepentabel en dashboard. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const display = (id: NoteId) => cap(noteName(parseId(id), "nl"));
export const withOctave = (id: NoteId) => `${display(id)}${parseId(id).octave}`;

export function octaveLabel(id: NoteId, range: [string, string]): string {
  const o = parseId(id).octave, lo = parseId(range[0]).octave, hi = parseId(range[1]).octave;
  if (hi - lo <= 1) return "";
  return o <= lo ? "laag" : o >= hi ? "hoog" : "";
}

export const noteLabel = (id: NoteId, range: [string, string]) => [display(id), octaveLabel(id, range)].filter(Boolean).join(" ");
