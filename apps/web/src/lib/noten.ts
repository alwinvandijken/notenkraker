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
 * Namen voor een lijst noten zonder dubbele: komt een naam twee keer voor, dan krijgt een noot onder
 * de startnoten "laag" en een noot erboven "hoog" (bijv. in de uitslag van de notentoets). Komt een
 * naam drie keer voor (het hele instrument), dan is de laagste "laag", de middelste gewoon en de hoogste "hoog".
 */
export function distinctLabels(notes: NoteId[], starter: NoteId[]): Record<NoteId, string> {
  const lo = Math.min(...starter.map(idToMidi)), hi = Math.max(...starter.map(idToMidi));
  const same = new Map<string, NoteId[]>();
  for (const n of notes) same.set(display(n), [...(same.get(display(n)) ?? []), n]);
  return Object.fromEntries(notes.map((n) => {
    const name = display(n), m = idToMidi(n);
    const group = [...same.get(name)!].sort((a, b) => idToMidi(a) - idToMidi(b));
    if (group.length < 2) return [n, name];
    if (group.length > 2) return [n, n === group[0] ? `${name} laag` : n === group[group.length - 1] ? `${name} hoog` : name];
    return [n, m < lo ? `${name} laag` : m > hi ? `${name} hoog` : name];
  }));
}
