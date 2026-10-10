import clsx from "clsx";
import { useApp } from "@/lib/store";

/** Melding na koppelen via een uitnodigingslink of code (groen gelukt, rood mislukt). */
export function KoppelMelding() {
  const melding = useApp((s) => s.koppelMelding);
  const dismiss = useApp((s) => s.dismissKoppelMelding);
  if (!melding) return null;
  return (
    <div role="status" className={clsx("flex items-start gap-3 rounded-2xl border-2 px-4 py-3 mb-3 text-sm", melding.ok ? "border-ok text-ok" : "border-wrong text-wrong")}>
      <span className="flex-1">{melding.ok ? "✓ " : ""}{melding.text}</span>
      <button type="button" aria-label="Melding sluiten" onClick={dismiss} className="cursor-pointer font-bold">×</button>
    </div>
  );
}
