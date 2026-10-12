import { useEffect } from "react";
import clsx from "clsx";

export interface Tab { key: string; label: string; icon: string; active: boolean; onSelect(): void }

/**
 * Vaste tabbalk onderin (AC-120, mock-up richting B): de hoofdnavigatie, altijd dezelfde plekken.
 * Zolang hij er staat, krijgt de body de klasse `met-tabbalk` (ruimte onderin, zie index.css).
 */
export function TabBalk({ tabs }: { tabs: Tab[] }) {
  useEffect(() => {
    document.body.classList.add("met-tabbalk");
    return () => document.body.classList.remove("met-tabbalk");
  }, []);

  return (
    <nav aria-label="Tabbalk" className="fixed inset-x-0 bottom-0 z-30 bg-surface border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="max-w-[720px] mx-auto flex">
        {tabs.map((t) => (
          <button key={t.key} type="button" aria-current={t.active ? "page" : undefined} onClick={t.onSelect}
            className={clsx("flex-1 h-[var(--tabbalk)] flex flex-col items-center justify-center gap-0.5 bg-transparent cursor-pointer font-display text-xs sm:text-sm",
              t.active ? "text-accent font-bold" : "text-muted font-medium")}>
            <span aria-hidden="true" className="text-xl leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
