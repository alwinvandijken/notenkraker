/**
 * Opnemen in de browser (AC-118 stap 1b). Chrome en Firefox nemen webm/opus op, Safari mp4/aac.
 * Hooguit 5 minuten per opname.
 */
export const MAX_SECONDS = 5 * 60;

export function pickAudioType(isTypeSupported: (type: string) => boolean): { mimeType: string; ext: string } {
  if (isTypeSupported("audio/webm;codecs=opus")) return { mimeType: "audio/webm;codecs=opus", ext: "webm" };
  if (isTypeSupported("audio/mp4")) return { mimeType: "audio/mp4", ext: "m4a" };
  return { mimeType: "", ext: "webm" };
}

/** "1:12" */
export function timeLabel(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
