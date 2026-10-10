import { parseInstrument, type Instrument } from "@notenkraker/core";
import altsax from "./altsax.json" with { type: "json" };

const RAW: unknown[] = [altsax];

/** Alle beschikbare instrumenten, gevalideerd tegen het schema bij het laden. */
export const INSTRUMENTS: Instrument[] = RAW.map(parseInstrument);

export function getInstrument(id: string): Instrument {
  const inst = INSTRUMENTS.find((i) => i.id === id);
  if (!inst) throw new Error(`Onbekend instrument: ${id}`);
  return inst;
}
