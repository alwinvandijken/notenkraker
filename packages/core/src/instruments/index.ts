import { z } from "zod";
import { chromaticRange, type NoteId } from "../music/index.js";

/**
 * Instrumentmodel. Een instrument is versiebeheerde content (JSON in
 * packages/instruments), geen gebruikersdata. Dit schema valideert die JSON.
 */

export const KeyShapeSchema = z.object({
  id: z.string(),
  /** c = rond (klep/gat), pill = langwerpig, oval = ovale parelmoerklep */
  shape: z.enum(["circle", "pill", "oval"]),
  x: z.number(),
  y: z.number(),
  /** straal (circle) of breedte/hoogte (pill, oval) */
  r: z.number().optional(),
  w: z.number().optional(),
  h: z.number().optional(),
  label: z.string().default(""),
  /** groep voor de bijschriften en het "toon alleen relevante kleppen"-filter */
  group: z.string().optional(),
  /** alleen tekenen als een noot van de leerling hem nodig heeft */
  auto: z.boolean().default(false),
  /** alleen tekenen als de huidige noot hem nodig heeft (zeldzame kleppen) */
  optional: z.boolean().default(false),
});

export const CaptionSchema = z.object({
  text: z.string(),
  x: z.number(),
  y: z.number(),
  /** bijschrift alleen tonen als een klep uit deze groep zichtbaar is */
  group: z.string().optional(),
});

export const KeyedLayoutSchema = z.object({
  kind: z.literal("keys"),
  viewBox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** verticale as (de buis) als decoratie */
  axis: z.object({ x: z.number(), y1: z.number(), y2: z.number() }).optional(),
  keys: z.array(KeyShapeSchema),
  captions: z.array(CaptionSchema).default([]),
  /** klep-ids die op dit exemplaar op één fysieke klep zitten (bv. pink links met 2 kleppen) */
  merge: z.record(z.string(), z.string()).default({}),
});

export const ValveLayoutSchema = z.object({ kind: z.literal("valves"), count: z.union([z.literal(3), z.literal(4)]) });
export const SlideLayoutSchema = z.object({ kind: z.literal("slide"), positions: z.number().default(7) });
export const KeyboardLayoutSchema = z.object({ kind: z.literal("keyboard"), from: z.string(), to: z.string() });
export const FretLayoutSchema = z.object({ kind: z.literal("frets"), strings: z.array(z.string()), frets: z.number() });

export const LayoutSchema = z.discriminatedUnion("kind", [
  KeyedLayoutSchema, ValveLayoutSchema, SlideLayoutSchema, KeyboardLayoutSchema, FretLayoutSchema,
]);

export const InstrumentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  family: z.enum(["woodwind", "brass", "keyboard", "string", "voice"]),
  clef: z.enum(["G", "F"]),
  /** geschreven → klinkend, in halve tonen (altsax −9, klarinet −2, dwarsfluit 0) */
  transposition: z.number().int(),
  /** geschreven bereik, inclusief */
  range: z.tuple([z.string(), z.string()]),
  /** noten die een beginner als eerste leert, in volgorde (voor presets en tutorials) */
  starterNotes: z.array(z.string()).default([]),
  layout: LayoutSchema,
  /** per geschreven noot: één of meer grepen; een greep is een lijst klep-ids */
  fingerings: z.record(z.string(), z.array(z.array(z.string()))),
  /** menselijke naam per klep-id, voor de tekstuitleg */
  keyNames: z.record(z.string(), z.string()).default({}),
});

export type Instrument = z.infer<typeof InstrumentSchema>;
export type InstrumentInput = z.input<typeof InstrumentSchema>;
export type KeyShape = z.infer<typeof KeyShapeSchema>;
export type KeyedLayout = z.infer<typeof KeyedLayoutSchema>;

export function parseInstrument(json: unknown): Instrument {
  return InstrumentSchema.parse(json);
}

/** Alle geschreven noten van het instrument, laag → hoog. */
export function instrumentNotes(inst: Instrument): NoteId[] {
  return chromaticRange(inst.range[0], inst.range[1]);
}

/** Eerste (voorkeurs)greep voor een noot, met samengevoegde kleppen toegepast. */
export function primaryFingering(inst: Instrument, note: NoteId): string[] {
  const alts = inst.fingerings[note];
  if (!alts || alts.length === 0) return [];
  const merge = inst.layout.kind === "keys" ? inst.layout.merge : {};
  return alts[0]!.map((k) => merge[k] ?? k);
}

/** Controle die in de test van elk instrumentpakket draait. */
export function validateInstrument(inst: Instrument): string[] {
  const problems: string[] = [];
  const notes = instrumentNotes(inst);
  for (const n of notes) if (!inst.fingerings[n]?.length) problems.push(`geen greep voor ${n}`);
  for (const n of Object.keys(inst.fingerings)) if (!notes.includes(n)) problems.push(`greep voor ${n} buiten bereik`);
  if (inst.layout.kind === "keys") {
    const ids = new Set(inst.layout.keys.map((k) => k.id));
    const merged = new Set(Object.values(inst.layout.merge));
    for (const [n, alts] of Object.entries(inst.fingerings))
      for (const alt of alts) for (const k of alt) {
        const target = inst.layout.merge[k] ?? k;
        if (!ids.has(target) && !merged.has(target)) problems.push(`onbekende klep ${k} bij ${n}`);
      }
  }
  for (const s of inst.starterNotes) if (!notes.includes(s)) problems.push(`starternoot ${s} buiten bereik`);
  return problems;
}
