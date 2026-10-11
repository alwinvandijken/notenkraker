import { audioContext, playMidi } from "./synth";

/**
 * Opnames van een echte altsax: tonejs-instruments van Nicholas Brosowsky, samples CC BY 3.0
 * (https://github.com/nbrosowsky/tonejs-instruments). Per halve toon een opname van de klinkende
 * toon; we nemen de dichtstbijzijnde en zetten die op de goede hoogte. Vaste commit, zodat de
 * bestanden niet onder ons veranderen. De service worker bewaart ze na de eerste keer (vite.config.ts).
 */
export const SAX_SAMPLES = "https://cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@622c2f1c32c8cfce4158ddc3eb26e518ddef37e5/samples/saxophone/";

const NAMES = ["Cs3", "D3", "Ds3", "E3", "F3", "Fs3", "G3", "Gs3", "As3", "B3", "C4", "Cs4", "D4", "Ds4", "E4", "F4", "Fs4", "G4", "Gs4",
  "A4", "As4", "B4", "C5", "Cs5", "D5", "Ds5", "E5", "F5", "Fs5", "G5", "Gs5", "A5"];
const SEMI: Record<string, number> = { C: 0, Cs: 1, D: 2, Ds: 3, E: 4, F: 5, Fs: 6, G: 7, Gs: 8, A: 9, As: 10, B: 11 };
const sampleMidi = (name: string) => { const m = /^([A-G]s?)(\d)$/.exec(name)!; return 12 * (Number(m[2]) + 1) + SEMI[m[1]!]!; };

const buffers = new Map<string, Promise<AudioBuffer>>();
function load(ac: AudioContext, name: string): Promise<AudioBuffer> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(SAX_SAMPLES + name + ".mp3")
      .then((r) => { if (!r.ok) throw new Error(`sample ${name}: ${r.status}`); return r.arrayBuffer(); })
      .then((b) => ac.decodeAudioData(b));
    // Mislukt laden niet onthouden: de volgende keer opnieuw proberen
    p.catch(() => buffers.delete(name));
    buffers.set(name, p);
  }
  return p;
}

/** Speel een klinkende toonhoogte (midi) als altsax. Lukt laden niet (offline), dan de referentietoon. */
export async function playSax(midi: number, seconds = 1.3) {
  try {
    const ac = audioContext();
    const name = NAMES.reduce((best, n) => (Math.abs(sampleMidi(n) - midi) < Math.abs(sampleMidi(best) - midi) ? n : best));
    const buf = await load(ac, name);
    const t = ac.currentTime, src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (midi - sampleMidi(name)) / 12);
    g.gain.setValueAtTime(0.9, t); g.gain.setValueAtTime(0.9, t + seconds); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.4);
    src.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + seconds + 0.45);
  } catch {
    playMidi(midi, seconds);
  }
}

export type Sound = "sax" | "toon";

/** Speel een noot met de gekozen klank */
export function playSound(midi: number, sound: Sound, seconds = 1.2) {
  if (sound === "sax") void playSax(midi, seconds); else playMidi(midi, seconds);
}
