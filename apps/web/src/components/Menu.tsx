import { useEffect, useRef, useState } from "react";
import { Menu as MenuIcon, X } from "lucide-react";
import clsx from "clsx";

export interface MenuItem { key: string; label: string; onSelect(): void; active?: boolean }

/** Hamburgermenu rechtsboven. Sluit bij een keuze, Escape of een tik ernaast. */
export function Menu({ title, items }: { title: string; items: MenuItem[] }) {
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
    <div ref={ref} className="relative">
      <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border-2 border-line bg-surface pl-4 pr-3 py-2 font-display font-semibold cursor-pointer">
        <span className="max-w-40 truncate">{title}</span>
        {open ? <X size={20} aria-hidden /> : <MenuIcon size={20} aria-hidden />}
      </button>
      {open && (
        <nav aria-label="Hoofdmenu" className="absolute right-0 mt-2 w-64 rounded-2xl border-2 border-line bg-surface p-2 shadow-lg z-20 flex flex-col">
          {items.map((it) => (
            <button key={it.key} type="button" aria-current={it.active ? "page" : undefined}
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={clsx("text-left rounded-xl px-3 py-3 cursor-pointer font-display", it.active ? "bg-accent-soft font-semibold" : "hover:bg-bg")}>
              {it.label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
