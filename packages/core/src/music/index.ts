/**
 * Muziektheorie zonder instrument- of UI-kennis.
 *
 * Een noot wordt geïdentificeerd door een `NoteId`: de Nederlandse naam plus
 * het octaafnummer van de GESCHREVEN toon, bv. "g4", "fis4", "bes3", "c6".
 * Octaafnummers volgen de wetenschappelijke notatie (c4 = centrale C).
 */

export type Letter = "c" | "d" | "e" | "f" | "g" | "a" | "b";
export type Accidental = "" | "#" | "b";
export type Clef = "G" | "F";
export type NamingScheme = "nl" | "en";

export interface Pitch {
  letter: Letter;
  accidental: Accidental;
  octave: number;
}

export type NoteId = string;

const LETTERS: Letter[] = ["c", "d", "e", "f", "g", "a", "b"];
const SEMITONE_OF_LETTER: Record<Letter, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Nederlandse naam zonder octaaf: c, cis, des, es, fis, bes, as, ... */
export function dutchName(p: Pitch): string {
  if (p.accidental === "#") return p.letter + "is";
  if (p.accidental === "b") {
    if (p.letter === "e" || p.letter === "a") return p.letter + "s"; // es, as
    return p.letter + "es"; // bes, des, ges, ces
  }
  return p.letter;
}

/** Engelse naam zonder octaaf: C, C#, Db, Eb, F#, Bb, ... */
export function englishName(p: Pitch): string {
  return p.letter.toUpperCase() + (p.accidental === "#" ? "♯" : p.accidental === "b" ? "♭" : "");
}

export function noteName(p: Pitch, scheme: NamingScheme = "nl"): string {
  return scheme === "nl" ? dutchName(p) : englishName(p);
}

export function toId(p: Pitch): NoteId {
  return dutchName(p) + p.octave;
}

const ID_RE = /^([a-g])(is|es|s)?(-?\d)$/;

export function parseId(id: NoteId): Pitch {
  const m = ID_RE.exec(id);
  if (!m) throw new Error(`Ongeldige noot-id: ${id}`);
  const letter = m[1] as Letter;
  const suffix = m[2] ?? "";
  const octave = Number(m[3]);
  let accidental: Accidental = "";
  if (suffix === "is") accidental = "#";
  else if (suffix === "es") accidental = "b";
  else if (suffix === "s") {
    if (letter !== "e" && letter !== "a") throw new Error(`Ongeldige noot-id: ${id}`);
    accidental = "b";
  }
  return { letter, accidental, octave };
}

/** MIDI-nummer van de geschreven toon (c4 = 60). */
export function toMidi(p: Pitch): number {
  const acc = p.accidental === "#" ? 1 : p.accidental === "b" ? -1 : 0;
  return 12 * (p.octave + 1) + SEMITONE_OF_LETTER[p.letter] + acc;
}

export function idToMidi(id: NoteId): number {
  return toMidi(parseId(id));
}

/** Diatonische stap t.o.v. c4 (c4 = 0, d4 = 1, b3 = -1). Bepaalt de plek op de notenbalk. */
export function diatonicStep(p: Pitch): number {
  return (p.octave - 4) * 7 + LETTERS.indexOf(p.letter);
}

/**
 * Positie op de notenbalk in halve lijnafstanden t.o.v. de onderste lijn.
 * G-sleutel: onderste lijn = e4. F-sleutel: onderste lijn = g2.
 * 0 = onderste lijn, 1 = eerste tussenruimte, 8 = bovenste lijn, negatief = eronder.
 */
export function staffPosition(p: Pitch, clef: Clef): number {
  const bottom = clef === "G" ? diatonicStep({ letter: "e", accidental: "", octave: 4 }) : diatonicStep({ letter: "g", accidental: "", octave: 2 });
  return diatonicStep(p) - bottom;
}

/** Hulplijnen die bij deze noot getekend moeten worden (posities, even getallen). */
export function ledgerLines(pos: number): number[] {
  const lines: number[] = [];
  for (let s = -2; s >= pos; s -= 2) lines.push(s);
  for (let s = 10; s <= pos; s += 2) lines.push(s);
  return lines;
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}

/** Klinkende MIDI-toon van een geschreven noot op een transponerend instrument. */
export function soundingMidi(written: NoteId, transposition: number): number {
  return idToMidi(written) + transposition;
}

/**
 * Chromatische reeks noot-ids tussen twee geschreven noten (inclusief), met
 * kruizen omhoog behalve waar de mol in Nederlandse lesboeken gangbaar is (bes, es).
 */
export function chromaticRange(from: NoteId, to: NoteId): NoteId[] {
  const lo = idToMidi(from), hi = idToMidi(to);
  if (hi < lo) throw new Error("Bereik: 'to' ligt onder 'from'");
  const out: NoteId[] = [];
  for (let m = lo; m <= hi; m++) out.push(toId(midiToPitch(m)));
  return out;
}

const SPELLING: Array<[Letter, Accidental]> = [
  ["c", ""], ["c", "#"], ["d", ""], ["e", "b"], ["e", ""], ["f", ""],
  ["f", "#"], ["g", ""], ["g", "#"], ["a", ""], ["b", "b"], ["b", ""],
];

/** Voorkeursspelling per halve toon: cis, es, fis, gis, bes. */
export function midiToPitch(midi: number): Pitch {
  const [letter, accidental] = SPELLING[((midi % 12) + 12) % 12]!;
  return { letter, accidental, octave: Math.floor(midi / 12) - 1 };
}

export function isAltered(p: Pitch): boolean {
  return p.accidental !== "";
}
