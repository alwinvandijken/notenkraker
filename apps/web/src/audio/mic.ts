import { detectPitch, type PitchReading } from "@notenkraker/core";
import { audioContext } from "./synth";

/**
 * Microfoon → PitchReading-stroom. Het algoritme zit in core; dit bestand
 * regelt alleen de browser-kant (getUserMedia, AnalyserNode, rAF-lus).
 */
export class MicListener {
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private buf = new Float32Array(4096);
  private raf = 0;
  private listeners = new Set<(r: PitchReading | null) => void>();

  get active() { return this.stream?.getAudioTracks().some((t) => t.readyState === "live") ?? false; }

  async start(): Promise<boolean> {
    if (this.active) return true;
    // een iPad zet de microfoon uit als de app op de achtergrond gaat; dan opnieuw beginnen
    if (this.stream) this.stop();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ac = audioContext();
      const src = ac.createMediaStreamSource(this.stream);
      this.analyser = ac.createAnalyser(); this.analyser.fftSize = 4096;
      src.connect(this.analyser);
      this.loop();
      return true;
    } catch { this.stream = null; return false; }
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null; this.analyser = null;
  }

  onReading(cb: (r: PitchReading | null) => void) { this.listeners.add(cb); return () => this.listeners.delete(cb); }

  private loop = () => {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    const r = detectPitch(this.buf, { sampleRate: audioContext().sampleRate, minHz: 100, maxHz: 1200 });
    this.listeners.forEach((cb) => cb(r));
    this.raf = requestAnimationFrame(this.loop);
  };
}
