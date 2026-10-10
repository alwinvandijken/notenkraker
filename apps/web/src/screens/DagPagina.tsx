import clsx from "clsx";
import { dateKey, dayDetail, playedOfTotal } from "@notenkraker/client";
import { noteLabel } from "@/lib/noten";
import { Donut } from "@/components/Donut";
import { ICON } from "@/lib/iconen";
import { useChildRows } from "./Dashboard";

/**
 * Pagina van één dag voor één kind: alle sessies vrij oefenen en alle rondes van het notenspel,
 * met per sessie de cirkel gespeeld/totaal, het balkje per minuut en de noten. Hier staan de
 * details; het overzicht en de kindpagina houden het kort.
 */

const time = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const longDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

export function DagPagina({ studentId, date, onDate }: { studentId: string; date: string; onDate(date: string): void }) {
  const row = useChildRows()?.find((r) => r.student.id === studentId);
  if (!row) return <p className="text-muted">Laden…</p>;
  const range = row.range;
  const d = dayDetail({ rounds: row.rounds, sessions: row.sessions, date });
  const shift = (n: number) => { const x = new Date(`${date}T12:00:00`); x.setDate(x.getDate() + n); return dateKey(x); };
  const isToday = date === dateKey(new Date());

  return (
    <div className="flex flex-col gap-3 min-w-0 max-w-[760px]">
      <nav className="rounded-3xl bg-surface px-3 py-2 flex items-center gap-2" aria-label="Andere dag">
        <button type="button" aria-label="Vorige dag" onClick={() => onDate(shift(-1))} className="w-11 h-11 rounded-full bg-bg font-bold cursor-pointer shrink-0">◀</button>
        <div className="flex-1 min-w-0 text-center">
          <div className="font-display font-bold text-lg first-letter:uppercase">{longDate(date)}</div>
          <div className="text-sm text-muted">{ICON.vrij} {d.free} min vrij · {ICON.spel} {d.game} min spel</div>
        </div>
        <button type="button" aria-label="Volgende dag" disabled={isToday} onClick={() => onDate(shift(1))} className="w-11 h-11 rounded-full bg-bg font-bold cursor-pointer disabled:opacity-30 shrink-0">▶</button>
      </nav>

      {d.items.length === 0 && <p className="text-muted text-center py-8 m-0">Deze dag is er niet geoefend.</p>}
      {d.items.map((it) => it.kind === "vrij" ? (
        <section key={it.id} className="rounded-2xl bg-surface p-4 flex gap-4 items-start">
          <Donut percent={it.percent} size={60} stroke={8}><b className="font-display text-sm">{it.percent}%</b></Donut>
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-lg">{ICON.vrij} Vrij oefenen</span>
              <span className="text-sm text-muted">{time(it.startedAt)}</span>
              {it.label === "twijfel"
                ? <span className="ml-auto rounded-xl px-2.5 py-1 text-xs font-semibold bg-les/25" title="Minuten lang steeds dezelfde noot">twijfelachtig</span>
                : <span className="ml-auto rounded-xl px-2.5 py-1 text-xs font-semibold bg-ok/15 text-ok">sax gehoord</span>}
            </div>
            <div><b>{playedOfTotal(it.playedSeconds, it.totalSeconds)} gespeeld</b></div>
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
          <span className="w-[60px] h-[60px] rounded-full bg-kent-soft flex items-center justify-center text-3xl shrink-0" aria-hidden="true">{ICON.spel}</span>
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
  );
}
