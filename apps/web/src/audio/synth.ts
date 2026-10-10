import { midiToFrequency } from "@notenkraker/core";

/** Referentietoon. iOS: AudioContext pas na een tik; we maken hem lazy. */
let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playMidi(midi: number, seconds = 0.55, a4 = 440) {
  try {
    const ac = audioContext(), t = ac.currentTime, f = midiToFrequency(midi, a4);
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = f * 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(lp); lp.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + seconds + 0.05);
  } catch { /* geen audio */ }
}
