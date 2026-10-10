import { idToMidi, noteName, parseId, type NoteId } from "@notenkraker/core";

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

/**
 * Namen voor een lijst noten zonder dubbele: komt een naam vaker voor, dan krijgt een noot onder
 * de startnoten "laag" en een noot erboven "hoog" (bijv. in de uitslag van de notentoets).
 */
export function distinctLabels(notes: NoteId[], starter: NoteId[]): Record<NoteId, string> {
  const lo = Math.min(...starter.map(idToMidi)), hi = Math.max(...starter.map(idToMidi));
  const count = new Map<string, number>();
  for (const n of notes) count.set(display(n), (count.get(display(n)) ?? 0) + 1);
  return Object.fromEntries(notes.map((n) => {
    const name = display(n), m = idToMidi(n);
    return [n, (count.get(name) ?? 0) < 2 ? name : m < lo ? `${name} laag` : m > hi ? `${name} hoog` : name];
  }));
}
