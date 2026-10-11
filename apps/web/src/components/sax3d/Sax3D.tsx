import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Instrument } from "@notenkraker/core";
import { createSax, type Sax, type SaxView } from "./engine";
import { IconButton } from "./IconButton";

/**
 * Greep op een draaibare 3D-altsax. Los geladen (React.lazy), zodat three.js alleen
 * binnenkomt als iemand de 3D-weergave kiest.
 *
 * Draaien met één vinger, zoomen met twee. Tik op een klep voor de naam,
 * twee keer tikken zoomt in op die klep.
 */

const CYCLE: SaxView[] = ["front", "left", "back", "right"];

export default function Sax3D({ instrument, pressed, needed, showAll, extra }:
  { instrument: Instrument; pressed: string[]; needed: Set<string>; showAll: boolean; extra?: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  const sax = useRef<Sax | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [apart, setApart] = useState(false);
  const view = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Welke kleppen alleen soms te zien zijn, uit de 2D-layout. Samengevoegde kleppen (cs, lb, lbb → "low") volgen hun groep.
  const { auto, optional } = useMemo(() => {
    const keys = instrument.layout.kind === "keys" ? instrument.layout : null;
    const auto = new Set(keys?.keys.filter((k) => k.auto).map((k) => k.id));
    const optional = new Set(keys?.keys.filter((k) => k.optional).map((k) => k.id));
    for (const [from, to] of Object.entries(keys?.merge ?? {})) {
      if (auto.has(to)) auto.add(from);
      if (optional.has(to)) optional.add(from);
    }
    return { auto, optional };
  }, [instrument]);

  const show = (text: string | null) => {
    setInfo(text);
    clearTimeout(timer.current);
    if (text) timer.current = setTimeout(() => setInfo(null), 2500);
  };

  // Laatste stand, zodat een nieuwe sax (ander instrument) meteen de goede greep toont
  const latest = useRef({ pressed, needed, showAll });
  latest.current = { pressed, needed, showAll };

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const s = createSax(el, { auto, optional, dist: 13.5, onTap: (id) => show(id ? (instrument.keyNames[id] ?? id) : null) });
    s.setNeeded(latest.current.needed);
    s.setShowAll(latest.current.showAll);
    s.setFingering(latest.current.pressed);
    sax.current = s;
    return () => { s.dispose(); sax.current = null; clearTimeout(timer.current); };
  }, [auto, optional, instrument]);

  useEffect(() => { sax.current?.setFingering(pressed); }, [pressed]);
  useEffect(() => { sax.current?.setNeeded(needed); }, [needed]);
  useEffect(() => { sax.current?.setShowAll(showAll); }, [showAll]);

  return (
    <div ref={stage} className="sax-stage absolute inset-0 overflow-hidden rounded-[inherit]">
      <div className="absolute top-3.5 right-3.5 z-[2] flex flex-col gap-2">
        <IconButton label="Andere kant" onClick={() => sax.current?.view(CYCLE[(view.current = (view.current + 1) % CYCLE.length)]!)}>
          <path d="M21 12a9 9 0 11-3-6.7" /><path d="M21 4v5h-5" />
        </IconButton>
        <IconButton label="Inzoomen" onClick={() => sax.current?.zoom(0.7)}><path d="M12 5v14M5 12h14" /></IconButton>
        <IconButton label="Uitzoomen" onClick={() => sax.current?.zoom(1.4)}><path d="M5 12h14" /></IconButton>
        <IconButton label={apart ? "In elkaar" : "Uit elkaar"} pressed={apart} onClick={() => setApart(sax.current?.toggleExplode() ?? false)}>
          <path d="M12 3v6M9 6l3-3 3 3M12 21v-6M9 18l3 3 3-3" /><rect x="7" y="10.5" width="10" height="3" rx="1.5" />
        </IconButton>
        {extra}
      </div>
      {info && (
        <div role="status" className="absolute left-1/2 -translate-x-1/2 bottom-3.5 z-[3] bg-fg text-surface px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap">
          {info}
        </div>
      )}
    </div>
  );
}

