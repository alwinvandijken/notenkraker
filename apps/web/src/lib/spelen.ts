import { namesLabel } from "@/lib/vandaag";

/** het resultaat van een ronde Spelen (AC-120 PR 3, mock-up docs/ux-review/vandaag.html) */
export function hardLabel(missed: string[]): string {
  const names = [...new Set(missed)];
  if (names.length === 0) return "Foutloos!";
  return `${namesLabel(names)} ${names.length === 1 ? "was" : "waren"} lastig`;
}

export function secondsLabel(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} seconden`;
}

/** wat de ronde oplevert voor de minuten van vandaag, en hoeveel er nog over is */
export function gainLabel(gain: number, left: number): string {
  const rest = left > 0 ? `nog ${left}` : "doel gehaald!";
  if (gain <= 0) return left > 0 ? `Nog ${left} ${left === 1 ? "minuut" : "minuten"} voor vandaag` : "Doel voor vandaag gehaald!";
  return `+${gain} ${gain === 1 ? "minuut" : "minuten"} voor vandaag · ${rest}`;
}
