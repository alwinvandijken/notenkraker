import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { VERSIE, versieLabel } from "@/lib/versie";

/** `apart`: met een lijntje erboven, voor Welkomstpagina en Uitloggen */
export interface MenuItem { key: string; label: string; onSelect(): void; active?: boolean; apart?: boolean }

/**
 * Avatarmenu rechtsboven (AC-120, mock-up richting B): alles wat niet in de tabbalk staat.
 * Bovenin wie je bent. Sluit bij een keuze, Escape of een tik ernaast.
 */
export function Menu({ name, subtitle, items }: { name: string; subtitle?: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" aria-label="Menu" aria-expanded={open} title={name} onClick={() => setOpen((v) => !v)}
        className={clsx("rounded-full cursor-pointer border-2", open ? "border-accent" : "border-transparent")}>
        <Initiaal name={name} />
      </button>
      {open && (
        <nav aria-label="Hoofdmenu" className="absolute right-0 mt-2 w-64 rounded-2xl border-2 border-line bg-surface p-2 shadow-lg z-40 flex flex-col">
          <div className="flex items-center gap-3 px-3 pt-2 pb-3 mb-1 border-b border-line">
            <Initiaal name={name} />
            <div className="min-w-0">
              <b className="font-display block truncate">{name}</b>
              {subtitle && <span className="text-sm text-muted block truncate">{subtitle}</span>}
            </div>
          </div>
          {items.map((it) => (
            <button key={it.key} type="button" aria-current={it.active ? "page" : undefined}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={clsx("text-left rounded-xl px-3 py-3 cursor-pointer font-display", it.apart && "mt-1 border-t border-line rounded-t-none",
                it.active ? "bg-accent-soft font-semibold" : "hover:bg-bg")}>
              {it.label}
            </button>
          ))}
          <p className="m-0 mt-1 px-3 pt-2 border-t border-line text-xs text-muted">{versieLabel(VERSIE)}</p>
        </nav>
      )}
    </div>
  );
}

function Initiaal({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="rounded-full bg-kent text-white font-display font-bold flex items-center justify-center w-11 h-11 text-lg shrink-0">
      {name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}
