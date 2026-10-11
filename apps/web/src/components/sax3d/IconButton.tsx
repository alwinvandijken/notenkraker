import type { ReactNode } from "react";

/** Ronde knop met een lijnicoon, zoals rechtsboven op de sax */
export function IconButton({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}
      className="w-11 h-11 p-0 rounded-full border border-line bg-surface grid place-items-center cursor-pointer shadow-sm aria-pressed:bg-fg aria-pressed:text-surface aria-pressed:border-fg">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
    </button>
  );
}
