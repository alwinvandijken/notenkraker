import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Oefenen in focus (AC-120, mock-up docs/ux-review/vandaag.html): over het hele scherm, zonder
 * tabbalk en avatar. De app eronder is zolang weg (body.in-focus, zie index.css), ook voor
 * VoiceOver en het toetsenbord. Gebruikt door Spelen en Vrij spelen.
 */
export function Focus({ label, children }: { label: string; children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add("in-focus");
    return () => document.body.classList.remove("in-focus");
  }, []);
  return createPortal(
    <section aria-label={label} className="fixed inset-0 z-50 bg-bg flex flex-col overflow-y-auto"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {children}
    </section>,
    document.body,
  );
}
