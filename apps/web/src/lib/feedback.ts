/**
 * Hulpjes voor feedback (AC-116): een korte naam voor het apparaat, en een link naar een nieuw
 * Linear-issue met de feedback al ingevuld (linear.new, geen API-sleutel nodig).
 */
export function deviceLabel(ua: string, width: number, touchPoints = 0): string {
  const device = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1) ? "iPad"
    : /Android/.test(ua) ? "Android" : /Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Ander apparaat";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${device} · ${browser} · ${width} px`;
}

export interface FeedbackForLinear {
  kind: "idee" | "fout" | "vraag";
  message: string;
  screen: string;
  displayName: string;
  role: string | null;
  device: string;
  version: string;
}

export function linearNewUrl(f: FeedbackForLinear): string {
  const first = f.message.split("\n")[0]!.trim();
  const head = `Feedback (${f.kind}): `;
  const max = 90 - head.length;
  const title = head + (first.length > max ? `${first.slice(0, max - 1)}…` : first);
  const description = [
    f.message, "",
    `Van: ${f.displayName || "onbekend"}${f.role ? ` (${f.role})` : ""}`,
    `Pagina: ${f.screen || "onbekend"}`,
    `Apparaat: ${f.device || "onbekend"}`,
    `Versie: ${f.version || "onbekend"}`,
  ].join("\n");
  return `https://linear.new/?${new URLSearchParams({ title, description })}`;
}
