import { useEffect, useState } from "react";
import type { HomeworkTemplate } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { useNoteLabels } from "@/components/Huiswerk";

/**
 * Sjablonen (AC-117): eigen opgaven om te hergebruiken. Bewaren gaat bij "Huiswerk geven" (vinkje
 * "Ook bewaren als sjabloon"); gebruiken ook daar, met één tik. Hier zie je ze allemaal en haal je
 * er een weg.
 */
export function Sjablonen() {
  const { students } = useApp();
  const labels = useNoteLabels(students[0]?.instrumentId ?? "altsax");
  const [items, setItems] = useState<HomeworkTemplate[] | null>(null);
  const load = () => void client.homework.templates().then(setItems).catch(() => setItems([]));
  useEffect(load, []);
  if (!items) return <p className="text-muted">Laden…</p>;
  const remove = async (t: HomeworkTemplate) => { setItems((l) => l?.filter((x) => x.id !== t.id) ?? null); await client.homework.removeTemplate(t.id); };

  return (
    <div className="flex flex-col gap-3 max-w-[760px]">
      {items.length === 0 && (
        <p className="rounded-3xl bg-surface p-5 m-0 text-muted">Nog geen sjablonen. Vink bij “Huiswerk geven” onderaan “Ook bewaren als sjabloon” aan, dan staat hij hier en kun je hem de volgende keer met één tik gebruiken.</p>
      )}
      {items.map((t) => (
        <section key={t.id} className="rounded-3xl bg-surface p-4 flex items-start gap-3">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <b className="font-display text-lg">{t.name}</b>
            <span className="text-sm text-muted">{t.minutesPerDay} min per dag, {t.daysPerWeek} {t.daysPerWeek === 1 ? "dag" : "dagen"} per week{t.piece ? ` · 🎵 ${t.piece}` : ""}</span>
            {t.notes.length > 0 && <div className="flex flex-wrap gap-1">{t.notes.map((n) => <span key={n} className="rounded-lg px-2 py-0.5 text-sm font-bold bg-les">{labels[n] ?? n}</span>)}</div>}
            {t.remark && <span className="text-sm">💬 “{t.remark}”</span>}
          </div>
          <button type="button" onClick={() => void remove(t)} className="text-sm font-semibold text-wrong bg-transparent cursor-pointer shrink-0">Weghalen</button>
        </section>
      ))}
    </div>
  );
}
