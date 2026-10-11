import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { instrumentNotes, midiToPitch, noteName, parseId, soundingMidi, toId, type Instrument, type NoteId, type NoteStatus, type StatusMap } from "@notenkraker/core";
import { playSound, type Sound } from "@/audio/sax";
import { useStatuses, usePref } from "@/lib/poc";
import { display, octaveLabel, withOctave } from "@/lib/noten";
import { StaffNote, StaffRow } from "@/components/Staff";
import { Fingering } from "@/components/Fingering";
import { Segmented } from "@/components/ui";
import { IconButton } from "@/components/sax3d/IconButton";
import { hasWebGL } from "@/components/sax3d/webgl";

// three.js is groot: pas laden als de 3D-weergave in beeld komt
const Sax3D = lazy(() => import("@/components/sax3d/Sax3D"));

/**
 * Proefconcept (AC-107): alleen de grepentabel, zonder leerling of spel,
 * zoals hij er in de echte app uit gaat zien.
 *
 * Vanaf 768 px breed (iPad staand en liggend) past alles op één scherm:
 * kopregel, sax links, noot rechts, notenkiezer onderaan als één schuifbare rij.
 * Smaller (telefoon) staat alles onder elkaar en scrolt de pagina.
 *
 * Zonder props (proefconcept op /) staat de notenstatus in deze browser. De app met
 * login op /app geeft de status van de gekozen leerling mee, plus een titel en het menu.
 */

type Filter = "mine" | "les" | "all";
type View = "buttons" | "staff";
type Render = "3d" | "2d";

const FILTERS: Array<[Filter, string]> = [["mine", "Mijn noten"], ["les", "In de les"], ["all", "Alle noten"]];
const STATUS: Array<[NoteStatus | "", string]> = [["kent", "Kent al"], ["les", "In de les"], ["moet", "Komt nog"], ["", "Geen"]];

/** Klasse per status: vorm én kleur verschillen, zodat het ook zonder kleurzicht leesbaar is. */
function statusClass(st: NoteStatus | undefined): string {
  if (st === "kent") return "bg-kent text-white border-kent";
  if (st === "les") return "bg-les text-fg border-les";
  if (st === "moet") return "bg-surface text-muted border-moet border-dashed";
  return "bg-surface text-fg border-line";
}

const panel = "rounded-3xl bg-surface";

export interface GrepentabelProps {
  instrument: Instrument;
  /** status van de leerling uit de database; zonder deze prop bewaart de browser de status zelf */
  student?: { statuses: StatusMap; setStatus(note: NoteId, status: NoteStatus | null): void };
  /** vervangt "Notenkraker" in de kopregel, bijvoorbeeld de naam van de leerling */
  title?: string;
  /** rechts in de kopregel, bijvoorbeeld Grepen/Spel en het menu */
  actions?: ReactNode;
  /** onder de kopregel, bijvoorbeeld een melding */
  notice?: ReactNode;
  /** helemaal rechts; op een smal scherm naast de titel */
  menu?: ReactNode;
}

export function Grepentabel({ instrument, student, title, actions, notice, menu }: GrepentabelProps) {
  const all = useMemo(() => instrumentNotes(instrument), [instrument]);
  const local = useStatuses(instrument.id, instrument.starterNotes);
  const { statuses, setStatus } = student ?? local;
  const [filter, setFilter] = usePref<Filter>("filter", "mine");
  const [view, setView] = usePref<View>("view", "buttons");
  const [render, setRender] = usePref<Render>("render", "3d");
  const [sound, setSound] = usePref<Sound>("sound", "sax");
  const [auto, setAuto] = usePref<"aan" | "uit">("auto", "uit");
  const [webgl] = useState(hasWebGL);
  const is3d = render === "3d" && webgl;
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

  const showAllButton = (
    <IconButton label={showAll ? "Alleen kleppen voor mijn noten" : "Toon alle kleppen"} pressed={showAll} onClick={() => setShowAll((v) => !v)}>
      <circle cx="9" cy="5.5" r="2.3" /><circle cx="9" cy="12" r="2.3" /><circle cx="9" cy="18.5" r="2.3" /><path d="M18 9v6M15 12h6" />
    </IconButton>
  );

  /** Een noot kiezen; met "bij elke noot" aan klinkt hij meteen (in de tik zelf, anders speelt iOS niets af). */
  const select = (n: NoteId) => {
    setSel(n); setAlt(0);
    if (auto === "aan") playSound(soundingMidi(n, instrument.transposition), sound);
  };
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
          <h1 className="font-display font-bold text-xl m-0 leading-tight">{title ?? "Notenkraker"}<span className="block text-xs font-medium text-muted">{instrument.name}</span></h1>
          {menu && <span className="ml-auto lg:hidden">{menu}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <Segmented value={filter} onChange={setFilter} label="Welke noten"
            options={FILTERS.map(([v, t]) => [v, `${t} (${counts[v]})`] as [Filter, string])} />
          <span className="ml-auto"><Segmented value={view} onChange={setView} label="Weergave notenkiezer" options={[["buttons", "Knoppen"], ["staff", "Notenbalk"]]} /></span>
          {actions}
          {menu && <span className="hidden lg:block">{menu}</span>}
        </div>
      </header>
      {notice}

      <main className="grid gap-3 md:flex-1 md:min-h-0 md:grid-cols-[minmax(260px,40%)_1fr] lg:grid-cols-[minmax(300px,42%)_1fr]">
        <section aria-label="Greep" className={`${panel} order-2 md:order-1 relative flex flex-col h-[440px] md:h-auto md:min-h-0`}>
          <div className="relative flex-1 min-h-0 rounded-3xl">
            {is3d ? (
              <Suspense fallback={<p className="absolute inset-0 grid place-items-center text-muted m-0">Sax laden…</p>}>
                <Sax3D instrument={instrument} pressed={fingering} needed={needed} showAll={showAll} extra={showAllButton} />
              </Suspense>
            ) : (
              <div className="absolute inset-0 pt-16 pb-3 pl-4 pr-[72px] flex items-center justify-center [&_svg]:max-w-none [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-full">
                <Fingering instrument={instrument} pressed={fingering} needed={needed} showAll={showAll} />
                <div className="absolute top-3.5 right-3.5 z-[2] flex flex-col gap-2">{showAllButton}</div>
              </div>
            )}
            {webgl && (
              <div className="absolute top-3.5 left-3.5 z-[2] shadow-sm rounded-3xl">
                <Segmented value={render} onChange={setRender} label="Weergave greep" options={[["3d", "3D"], ["2d", "Eenvoudig"]]} />
              </div>
            )}
          </div>
          <div className="p-4 pt-3 flex flex-col items-center gap-2 shrink-0">
            {options.length > 1 && (
              <Segmented value={String(alt)} onChange={(v) => setAlt(Number(v))} label="Greep"
                options={options.map((_, i) => [String(i), i === 0 ? "Gewone greep" : `Alternatief ${i}`] as [string, string])} />
            )}
            <p className="text-center text-base leading-snug m-0">
              {keyNames.length
                ? <>Druk in: {keyNames.map((k, i) => <b key={i}>{k}{i < keyNames.length - 1 ? ", " : ""}</b>)}</>
                : <>Niets indrukken, alles <b>open</b></>}
            </p>
          </div>
        </section>

        <section aria-label="Noot" className={`${panel} order-1 md:order-2 p-4 md:p-5 flex flex-col gap-3 md:min-h-0`}>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl border-2 whitespace-nowrap ${statusClass(statuses[current])}`}>
                {STATUS.find(([v]) => v === (statuses[current] ?? ""))?.[1]}
              </span>
              {/* op het witte vlak een grijze ondergrond, zoals in de mock-up */}
              <span className="ml-auto [&>span]:bg-bg [&>span]:flex-nowrap [&_button]:px-3 md:[&_button]:px-4">
                <Segmented value={sound} label="Klank" onChange={(v) => { setSound(v); playSound(sounding, v); }}
                  options={[["sax", "Sax"], ["toon", "Toon"]]} />
              </span>
              <button type="button" aria-label="Laat horen" title="Laat horen" onClick={() => playSound(sounding, sound)}
                className="w-11 h-11 rounded-full border-2 border-fg flex items-center justify-center cursor-pointer">
                <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 8h4l5-4v14l-5-4H3z" fill="currentColor" /><path d="M15 7.5a5 5 0 010 7M17.5 5a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
              </button>
              <button type="button" aria-pressed={auto === "aan"} onClick={() => { const on = auto !== "aan"; setAuto(on ? "aan" : "uit"); if (on) playSound(sounding, sound); }}
                aria-label="Bij elke noot" title={auto === "aan" ? "Je hoort elke noot die je kiest (tik om uit te zetten)" : "Speel de noot bij elke wissel"}
                className="min-h-11 min-w-11 px-2.5 md:px-3.5 rounded-full border-2 border-line text-muted flex items-center justify-center gap-1.5 text-sm font-semibold cursor-pointer aria-pressed:bg-fg aria-pressed:border-fg aria-pressed:text-surface">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2l3 3-3 3" /><path d="M4 11V9a4 4 0 014-4h12" /><path d="M7 22l-3-3 3-3" /><path d="M20 13v2a4 4 0 01-4 4H4" /></svg>
                <span className="hidden md:inline whitespace-nowrap">Bij elke noot</span>
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
