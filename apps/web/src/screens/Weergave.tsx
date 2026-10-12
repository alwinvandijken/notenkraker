import { useState, type ReactNode } from "react";
import type { Sound } from "@/audio/sax";
import { usePref } from "@/lib/poc";
import { hasWebGL } from "@/components/sax3d/webgl";
import { Segmented } from "@/components/ui";
import type { Filter, Render, View } from "@/screens/Grepentabel";

/**
 * Weergave (AC-120 PR 4, mock-up docs/ux-review/vandaag.html bij Grepen): alles wat je één keer
 * instelt, op een eigen pagina in plaats van als knoppen op Grepen. Bewaard in deze browser
 * (dezelfde voorkeuren als de grepentabel leest), dus per apparaat.
 */
export function Weergave() {
  const [filter, setFilter] = usePref<Filter>("filter", "mine");
  const [view, setView] = usePref<View>("view", "buttons");
  const [sound, setSound] = usePref<Sound>("sound", "sax");
  const [render, setRender] = usePref<Render>("render", "3d");
  const [auto, setAuto] = usePref<"aan" | "uit">("auto", "uit");
  const [webgl] = useState(hasWebGL);

  return (
    <div className="flex flex-col gap-3 max-w-[640px]">
      <p className="text-muted m-0">Hoe Grepen eruitziet. Geldt op dit apparaat.</p>
      <div className="rounded-3xl bg-surface px-5 py-2 flex flex-col">
        <Rij label="Welke noten" hint="in de notenrij onderaan">
          <Segmented value={filter} onChange={setFilter} label="Welke noten" options={[["mine", "Mijn noten"], ["les", "In de les"], ["all", "Alle"]]} />
        </Rij>
        <Rij label="Noten tonen als">
          <Segmented value={view} onChange={setView} label="Noten tonen als" options={[["buttons", "Letters"], ["staff", "Notenbalk"], ["both", "Beide"]]} />
        </Rij>
        <Rij label="Geluid">
          <Segmented value={sound} onChange={setSound} label="Geluid" options={[["sax", "Sax"], ["toon", "Toon"]]} />
        </Rij>
        {webgl && (
          <Rij label="Saxofoon">
            <Segmented value={render} onChange={setRender} label="Saxofoon" options={[["3d", "3D"], ["2d", "Eenvoudig"]]} />
          </Rij>
        )}
        <Rij label="Noot laten horen" hint="bij elke noot die je kiest">
          <Segmented value={auto} onChange={setAuto} label="Noot laten horen bij elke noot" options={[["uit", "Uit"], ["aan", "Aan"]]} />
        </Rij>
      </div>
    </div>
  );
}

function Rij({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 border-t border-line first:border-t-0">
      <span className="min-w-0"><b className="block">{label}</b>{hint && <span className="text-sm text-muted">{hint}</span>}</span>
      <span className="[&>span]:bg-bg">{children}</span>
    </div>
  );
}
