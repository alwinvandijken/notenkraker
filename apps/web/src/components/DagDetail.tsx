import { useEffect } from "react";
import clsx from "clsx";
import { dateKey, dayDetail, type PracticeSession, type Round } from "@notenkraker/client";
import { noteLabel } from "@/lib/noten";
import { Donut } from "@/components/Donut";

/**
 * Detailpaneel van één dag voor één kind (4/5 van het scherm): alle sessies vrij oefenen en
 * alle rondes van het notenspel, met per sessie de cirkel gespeeld/totaal en het balkje per minuut.
 */
export const ICON = { vrij: "🎷", spel: "🎮" } as const;

const time = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const longDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

export function DagDetail({ name, date, rounds, sessions, range, onDate, onClose }: {
  name: string; date: string; rounds: Round[]; sessions: PracticeSession[]; range: [string, string];
  onDate(date: string): void; onClose(): void;
}) {
  const d = dayDetail({ rounds, sessions, date });
  const shift = (n: number) => { const x = new Date(`${date}T12:00:00`); x.setDate(x.getDate() + n); return dateKey(x); };
  const isToday = date === dateKey(new Date());

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onDate(shift(-1));
      if (e.key === "ArrowRight" && !isToday) onDate(shift(1));
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  });

  return (
    <div className="fixed inset-0 z-50 bg-fg/40 flex items-center justify-center p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`${name}, ${longDate(date)}`} onClick={(e) => e.stopPropagation()}
        className="bg-bg rounded-3xl shadow-2xl w-full sm:w-4/5 h-[90vh] sm:h-4/5 flex flex-col overflow-hidden">
        <header className="flex items-center gap-2 px-5 py-4 bg-surface border-b border-line">
          <button type="button" aria-label="Vorige dag" onClick={() => onDate(shift(-1))} className="w-11 h-11 rounded-full bg-bg font-bold cursor-pointer">◀</button>
          <div className="flex-1 min-w-0 text-center">
            <div className="font-display font-bold text-xl truncate">{name} · {longDate(date)}</div>
            <div className="text-sm text-muted">{ICON.vrij} {d.free} min vrij oefenen · {ICON.spel} {d.game} min notenspel</div>
          </div>
          <button type="button" aria-label="Volgende dag" disabled={isToday} onClick={() => onDate(shift(1))} className="w-11 h-11 rounded-full bg-bg font-bold cursor-pointer disabled:opacity-30">▶</button>
          <button type="button" aria-label="Sluiten" onClick={onClose} className="w-11 h-11 rounded-full border-2 border-line bg-surface font-bold cursor-pointer ml-1">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {d.items.length === 0 && <p className="text-muted m-auto">Deze dag is er niet geoefend.</p>}
          {d.items.map((it) => it.kind === "vrij" ? (
            <section key={it.id} className="rounded-2xl bg-surface p-4 flex gap-4 items-start">
              <Donut percent={it.percent} size={72} stroke={9}><b className="font-display text-base">{it.percent}%</b></Donut>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-lg">{ICON.vrij} Vrij oefenen</span>
                  <span className="text-sm text-muted">{time(it.startedAt)}</span>
                  {it.label === "twijfel"
                    ? <span className="ml-auto rounded-xl px-2.5 py-1 text-xs font-semibold bg-les/25" title="Minuten lang steeds dezelfde noot">twijfelachtig</span>
                    : <span className="ml-auto rounded-xl px-2.5 py-1 text-xs font-semibold bg-ok/15 text-ok">sax gehoord</span>}
                </div>
                <div><b>{it.playedMinutes} van {it.totalMinutes} min gespeeld</b></div>
                {it.perMinute.length > 0 && (
                  <div className="flex gap-0.5 h-5" aria-label="Per minuut gespeeld">
                    {it.perMinute.map((sec, i) => (
                      <i key={i} title={`minuut ${i + 1}: ${sec} s gespeeld`} className={clsx("flex-1 max-w-4 rounded-sm", sec >= 30 ? "bg-ok" : sec > 0 ? "bg-ok/40" : "bg-line")} />
                    ))}
                  </div>
                )}
                {it.notes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">{it.notes.map((n) => <span key={n} className="rounded-lg px-2 py-0.5 text-sm font-bold bg-kent-soft">{noteLabel(n, range)}</span>)}</div>
                )}
              </div>
            </section>
          ) : (
            <section key={it.id} className="rounded-2xl bg-surface p-4 flex gap-4 items-center">
              <span className="w-[72px] h-[72px] rounded-full bg-kent-soft flex items-center justify-center text-3xl shrink-0" aria-hidden="true">{ICON.spel}</span>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-lg">Notenspel</span>
                  <span className="text-sm text-muted">{time(it.at)} · {it.minutes} min</span>
                  <span className="ml-auto text-key tracking-widest" aria-label={`${it.stars} sterren`}>{"★".repeat(it.stars)}{"☆".repeat(3 - it.stars)}</span>
                </div>
                <div><b>{it.correct} van {it.total} goed</b></div>
                {it.wrongNotes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">{it.wrongNotes.map((n, i) => <span key={i} className="rounded-lg px-2 py-0.5 text-sm font-bold border-2 border-wrong text-wrong">{noteLabel(n, range)}</span>)}</div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
