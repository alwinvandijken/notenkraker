import { useEffect, useMemo, useRef, useState } from "react";
import { instrumentNotes, midiToPitch, noteName, parseId, soundingMidi, toId, type Instrument, type NoteId, type NoteStatus } from "@notenkraker/core";
import { playMidi } from "@/audio/synth";
import { useStatuses, usePref } from "@/lib/poc";
import { StaffNote, StaffRow } from "@/components/Staff";
import { Fingering } from "@/components/Fingering";
import { Segmented } from "@/components/ui";

/**
 * Proefconcept (AC-107): alleen de grepentabel, zonder leerling of spel,
 * zoals hij er in de echte app uit gaat zien.
 *
 * Vanaf 768 px breed (iPad staand en liggend) past alles op één scherm:
 * kopregel, sax links, noot rechts, notenkiezer onderaan als één schuifbare rij.
 * Smaller (telefoon) staat alles onder elkaar en scrolt de pagina.
 */

type Filter = "mine" | "les" | "all";
type View = "buttons" | "staff";

const FILTERS: Array<[Filter, string]> = [["mine", "Mijn noten"], ["les", "In de les"], ["all", "Alle noten"]];
const STATUS: Array<[NoteStatus | "", string]> = [["kent", "Kent al"], ["les", "In de les"], ["moet", "Komt nog"], ["", "Geen"]];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const display = (id: NoteId) => cap(noteName(parseId(id), "nl"));
const withOctave = (id: NoteId) => `${display(id)}${parseId(id).octave}`;

function octaveLabel(id: NoteId, range: [string, string]): string {
  const o = parseId(id).octave, lo = parseId(range[0]).octave, hi = parseId(range[1]).octave;
  if (hi - lo <= 1) return "";
  return o <= lo ? "laag" : o >= hi ? "hoog" : "";
}

/** Klasse per status: vorm én kleur verschillen, zodat het ook zonder kleurzicht leesbaar is. */
function statusClass(st: NoteStatus | undefined): string {
  if (st === "kent") return "bg-kent text-white border-kent";
  if (st === "les") return "bg-les text-fg border-les";
  if (st === "moet") return "bg-surface text-muted border-moet border-dashed";
  return "bg-surface text-fg border-line";
}

const panel = "rounded-3xl bg-surface";

export function Grepentabel({ instrument }: { instrument: Instrument }) {
  const all = useMemo(() => instrumentNotes(instrument), [instrument]);
  const { statuses, setStatus } = useStatuses(instrument.id, instrument.starterNotes);
  const [filter, setFilter] = usePref<Filter>("filter", "mine");
  const [view, setView] = usePref<View>("view", "buttons");
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<NoteId>(instrument.starterNotes[0] ?? all[0]!);
  const [alt, setAlt] = useState(0);

  const visible = filter === "all" ? all : all.filter((n) => (filter === "les" ? statuses[n] === "les" : Boolean(statuses[n])));
  const current = visible.includes(sel) ? sel : (visible[0] ?? sel);
  const options = instrument.fingerings[current] ?? [];
  const fingering = options[Math.min(alt, Math.max(options.length - 1, 0))] ?? [];
  const needed = useMemo(() => new Set(all.filter((n) => statuses[n]).flatMap((n) => instrument.fingerings[n]?.[0] ?? [])), [all, statuses, instrument]);
  const keyNames = fingering.map((k) => instrument.keyNames[k] ?? k);
  const sounding = soundingMidi(current, instrument.transposition);
  const counts = { mine: all.filter((n) => statuses[n]).length, les: all.filter((n) => statuses[n] === "les").length, all: all.length };

  const select = (n: NoteId) => { setSel(n); setAlt(0); };
  const step = (d: number) => { if (!visible.length) return; const i = visible.indexOf(current); select(visible[(i + d + visible.length) % visible.length]!); };

  return (
    <div className="flex flex-col gap-3 p-4 md:p-5 md:h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 shrink-0">
        <div className="flex items-center gap-2.5 w-full lg:w-auto">
          <svg width="36" height="36" viewBox="0 0 40 40" aria-hidden="true">
            <rect width="40" height="40" rx="12" fill="var(--color-fg)" />
            <ellipse cx="17" cy="27" rx="7" ry="5" fill="var(--color-les)" transform="rotate(-20 17 27)" />
            <path d="M23 26V9l8 4" stroke="var(--color-les)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="font-display font-bold text-xl m-0 leading-tight">Notenkraker<span className="block text-xs font-medium text-muted">{instrument.name}</span></h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <Segmented value={filter} onChange={setFilter} label="Welke noten"
            options={FILTERS.map(([v, t]) => [v, `${t} (${counts[v]})`] as [Filter, string])} />
          <span className="ml-auto"><Segmented value={view} onChange={setView} label="Weergave notenkiezer" options={[["buttons", "Knoppen"], ["staff", "Notenbalk"]]} /></span>
        </div>
      </header>

      <main className="grid gap-3 md:flex-1 md:min-h-0 md:grid-cols-[minmax(240px,34%)_1fr] lg:grid-cols-[minmax(280px,32%)_1fr]">
        <section aria-label="Greep" className={`${panel} order-2 md:order-1 p-4 flex flex-col items-center gap-2 md:min-h-0`}>
          {options.length > 1 && (
            <Segmented value={String(alt)} onChange={(v) => setAlt(Number(v))} label="Greep"
              options={options.map((_, i) => [String(i), i === 0 ? "Gewone greep" : `Alternatief ${i}`] as [string, string])} />
          )}
          <div className="w-full max-w-[300px] md:max-w-none md:flex-1 md:min-h-0 flex items-center justify-center [&_svg]:max-w-none md:[&_svg]:h-full md:[&_svg]:w-auto md:[&_svg]:max-w-full">
            <Fingering instrument={instrument} pressed={fingering} needed={needed} showAll={showAll} />
          </div>
          <p className="text-center text-base leading-snug m-0">
            {keyNames.length
              ? <>Druk in: {keyNames.map((k, i) => <b key={i}>{k}{i < keyNames.length - 1 ? ", " : ""}</b>)}</>
              : <>Niets indrukken, alles <b>open</b></>}
          </p>
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}
            className="min-h-11 px-4 rounded-full border-2 border-dashed border-line text-muted text-sm font-medium cursor-pointer shrink-0">
            {showAll ? "Alleen kleppen voor mijn noten" : "Toon alle kleppen"}
          </button>
        </section>

        <section aria-label="Noot" className={`${panel} order-1 md:order-2 p-4 md:p-5 flex flex-col gap-3 md:min-h-0`}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl border-2 ${statusClass(statuses[current])}`}>
                {STATUS.find(([v]) => v === (statuses[current] ?? ""))?.[1]}
              </span>
              <button type="button" aria-label="Laat horen" title="Laat horen" onClick={() => playMidi(sounding, 1.2)}
                className="ml-auto w-11 h-11 rounded-full border-2 border-fg flex items-center justify-center cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 8h4l5-4v14l-5-4H3z" fill="currentColor" /><path d="M15 7.5a5 5 0 010 7M17.5 5a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
              </button>
            </div>
            <span className="text-muted text-sm">Geschreven {withOctave(current)} · klinkt als {withOctave(toId(midiToPitch(sounding)))}</span>
          </div>

          <div className="flex items-center gap-4 md:flex-1 md:min-h-0">
            <div className="flex-1 min-w-0 h-full flex items-center [&_svg]:max-w-none md:[&_svg]:max-h-full">
              <StaffNote note={current} clef={instrument.clef} color="var(--color-kent)" />
            </div>
            <div className="shrink-0 text-center pr-2">
              <div className="font-display font-bold text-[80px] lg:text-[104px] leading-[0.9] tracking-tight">{display(current)}</div>
              <div className="text-muted text-base h-6">{octaveLabel(current, instrument.range)}</div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span id="status-label" className="text-muted text-sm">Status</span>
            <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="status-label">
              {STATUS.map(([v, t]) => {
                const on = (statuses[current] ?? "") === v;
                return (
                  <button key={v} type="button" aria-pressed={on} onClick={() => setStatus(current, v || null)}
                    className={`min-h-11 px-2 rounded-full border-2 font-semibold text-[15px] whitespace-nowrap cursor-pointer ${on ? statusClass(v || undefined) + " ring-2 ring-fg ring-offset-2 ring-offset-surface" : "bg-surface border-line text-fg"}`}>{t}</button>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <nav aria-label="Kies een noot" className={`${panel} shrink-0 p-2 flex items-center gap-2`}>
        <button type="button" onClick={() => step(-1)} aria-label="Vorige noot" className="shrink-0 w-12 h-16 rounded-2xl bg-bg font-bold text-lg cursor-pointer">◀</button>
        <div className="flex-1 min-w-0">
          {visible.length === 0 ? (
            <p className="text-muted m-0 px-2">Nog geen noten in deze lijst. Kies "Alle noten" en geef een noot een status.</p>
          ) : view === "buttons" ? (
            <NoteButtons notes={visible} current={current} statuses={statuses} range={instrument.range} onSelect={select} />
          ) : (
            <div className="[&>div]:border-0 [&>div]:py-0">
              <StaffRow clef={instrument.clef} naming="nl" height={180} showNames={false} onSelect={(id) => select(id)}
                notes={visible.map((n) => ({ id: n, selected: n === current, sub: octaveLabel(n, instrument.range) }))} />
            </div>
          )}
        </div>
        <button type="button" onClick={() => step(1)} aria-label="Volgende noot" className="shrink-0 w-12 h-16 rounded-2xl bg-bg font-bold text-lg cursor-pointer">▶</button>
      </nav>
    </div>
  );
}

function NoteButtons({ notes, current, statuses, range, onSelect }:
  { notes: NoteId[]; current: NoteId; statuses: Record<NoteId, NoteStatus>; range: [string, string]; onSelect: (n: NoteId) => void }) {
  const row = useRef<HTMLDivElement>(null);
  // Houd de gekozen noot in beeld als je met Vorige/Volgende door de rij gaat.
  useEffect(() => { row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }, [current]);
  return (
    <div ref={row} className="flex gap-2 overflow-x-auto py-1.5 px-1 [scrollbar-width:thin]">
      {notes.map((n) => (
        <button key={n} type="button" aria-pressed={n === current} onClick={() => onSelect(n)}
          className={`shrink-0 w-14 h-14 p-0 rounded-2xl border-2 font-display font-bold cursor-pointer grid place-content-center justify-items-center gap-0.5 aria-pressed:outline-3 aria-pressed:outline-fg aria-pressed:outline-offset-2 ${statusClass(statuses[n])}`}>
          <span className={`leading-none ${parseId(n).accidental ? "text-base" : "text-xl"}`}>{display(n)}</span>
          {octaveLabel(n, range) && <span className="leading-none text-[10px] font-medium opacity-80">{octaveLabel(n, range)}</span>}
        </button>
      ))}
    </div>
  );
}
