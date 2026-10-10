import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { instrumentNotes, midiToPitch, noteName, parseId, soundingMidi, type Instrument, type NoteId, type NoteStatus } from "@notenkraker/core";
import { playMidi } from "@/audio/synth";
import { useReviews, useStatuses, usePref, type Review, type ReviewMap } from "@/lib/poc";
import { StaffNote, StaffRow } from "@/components/Staff";
import { Fingering } from "@/components/Fingering";
import { Segmented } from "@/components/ui";

/**
 * Proefconcept (AC-107): alleen de grepentabel, zonder leerling of spel.
 * Bedoeld om de grepen per noot door een docent te laten controleren.
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
const withOctave = (id: NoteId) => { const p = parseId(id); return `${cap(noteName(p, "nl"))}${p.octave}`; };

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
  const { reviews, setReview, clear } = useReviews(instrument.id);
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
  const soundingId = (() => { const p = midiToPitch(sounding); return `${cap(noteName(p, "nl"))}${p.octave}`; })();
  const review = reviews[current] ?? { verdict: null, comment: "" };
  const counts = { mine: all.filter((n) => statuses[n]).length, les: all.filter((n) => statuses[n] === "les").length, all: all.length };

  const select = (n: NoteId) => { setSel(n); setAlt(0); };
  const step = (d: number) => { if (!visible.length) return; const i = visible.indexOf(current); select(visible[(i + d + visible.length) % visible.length]!); };

  return (
    <div className="flex flex-col gap-3 p-4 md:p-5 md:h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <svg width="36" height="36" viewBox="0 0 40 40" aria-hidden="true">
            <rect width="40" height="40" rx="12" fill="var(--color-fg)" />
            <ellipse cx="17" cy="27" rx="7" ry="5" fill="var(--color-les)" transform="rotate(-20 17 27)" />
            <path d="M23 26V9l8 4" stroke="var(--color-les)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1 className="font-display font-bold text-xl m-0 leading-tight">Notenkraker<span className="block text-xs font-medium text-muted">Proefversie · {instrument.name}</span></h1>
        </div>
        <Segmented value={filter} onChange={setFilter} label="Welke noten"
          options={FILTERS.map(([v, t]) => [v, `${t} (${counts[v]})`] as [Filter, string])} />
        <span className="ml-auto"><Segmented value={view} onChange={setView} label="Weergave notenkiezer" options={[["buttons", "Knoppen"], ["staff", "Notenbalk"]]} /></span>
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
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl border-2 ${statusClass(statuses[current])}`}>
              {STATUS.find(([v]) => v === (statuses[current] ?? ""))?.[1]}
            </span>
            <span className="text-muted text-sm">Geschreven {withOctave(current)} · klinkt als {soundingId}</span>
            <button type="button" onClick={() => playMidi(sounding, 1.2)}
              className="ml-auto inline-flex items-center gap-2 min-h-11 px-4 rounded-full border-2 border-fg font-semibold cursor-pointer">
              <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 8h4l5-4v14l-5-4H3z" fill="currentColor" /><path d="M15 7.5a5 5 0 010 7M17.5 5a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
              Laat horen
            </button>
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

          <div className="flex flex-wrap gap-2 items-center" role="group" aria-label="Status van deze noot">
            <span className="text-muted text-sm mr-1">Status</span>
            {STATUS.map(([v, t]) => {
              const on = (statuses[current] ?? "") === v;
              return (
                <button key={v} type="button" aria-pressed={on} onClick={() => setStatus(current, v || null)}
                  className={`min-h-11 px-4 rounded-full border-2 font-semibold text-[15px] cursor-pointer ${on ? statusClass(v || undefined) + " ring-2 ring-fg ring-offset-2 ring-offset-surface" : "bg-surface border-line text-fg"}`}>{t}</button>
              );
            })}
          </div>

          <ReviewPanel note={current} review={review} onChange={(p) => setReview(current, p)}>
            <ReviewSummary instrument={instrument} notes={all} reviews={reviews} onClear={clear} />
          </ReviewPanel>
        </section>
      </main>

      <nav aria-label="Kies een noot" className={`${panel} shrink-0 p-2 flex items-center gap-2`}>
        <button type="button" onClick={() => step(-1)} aria-label="Vorige noot" className="shrink-0 w-12 h-16 rounded-2xl bg-bg font-bold text-lg cursor-pointer">◀</button>
        <div className="flex-1 min-w-0">
          {visible.length === 0 ? (
            <p className="text-muted m-0 px-2">Nog geen noten in deze lijst. Kies "Alle noten" en geef een noot een status.</p>
          ) : view === "buttons" ? (
            <NoteButtons notes={visible} current={current} statuses={statuses} reviews={reviews} range={instrument.range} onSelect={select} />
          ) : (
            <div className="[&>div]:border-0 [&>div]:py-0">
              <StaffRow clef={instrument.clef} naming="nl" height={170} onSelect={(id) => select(id)}
                notes={visible.map((n) => ({ id: n, selected: n === current, sub: octaveLabel(n, instrument.range), color: reviews[n]?.verdict === "fout" ? "var(--color-wrong)" : undefined }))} />
            </div>
          )}
        </div>
        <button type="button" onClick={() => step(1)} aria-label="Volgende noot" className="shrink-0 w-12 h-16 rounded-2xl bg-bg font-bold text-lg cursor-pointer">▶</button>
      </nav>
    </div>
  );
}

function NoteButtons({ notes, current, statuses, reviews, range, onSelect }:
  { notes: NoteId[]; current: NoteId; statuses: Record<NoteId, NoteStatus>; reviews: ReviewMap; range: [string, string]; onSelect: (n: NoteId) => void }) {
  const row = useRef<HTMLDivElement>(null);
  // Houd de gekozen noot in beeld als je met Vorige/Volgende door de rij gaat.
  useEffect(() => { row.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" }); }, [current]);
  return (
    <div ref={row} className="flex gap-2 overflow-x-auto py-1.5 px-1 [scrollbar-width:thin]">
      {notes.map((n) => {
        const r = reviews[n]?.verdict;
        return (
          <button key={n} type="button" aria-pressed={n === current} onClick={() => onSelect(n)}
            aria-label={`${withOctave(n)}${r === "ok" ? ", klopt" : r === "fout" ? ", klopt niet" : ""}`}
            className={`relative shrink-0 w-14 h-14 p-0 rounded-2xl border-2 font-display font-bold cursor-pointer grid place-content-center justify-items-center gap-0.5 aria-pressed:outline-3 aria-pressed:outline-fg aria-pressed:outline-offset-2 ${statusClass(statuses[n])}`}>
            <span className={`leading-none ${parseId(n).accidental ? "text-base" : "text-xl"}`}>{display(n)}</span>
            {octaveLabel(n, range) && <span className="leading-none text-[10px] font-medium opacity-80">{octaveLabel(n, range)}</span>}
            {r && <span aria-hidden="true" className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center text-white ${r === "ok" ? "bg-ok" : "bg-wrong"}`}>{r === "ok" ? "✓" : "!"}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ReviewPanel({ note, review, onChange, children }: { note: NoteId; review: Review; onChange: (p: Partial<Review>) => void; children?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-bg p-3 flex flex-wrap items-center gap-2">
      <div className="w-full flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Controle: klopt de greep voor {withOctave(note)}?</span>
        {children}
      </div>
      <button type="button" aria-pressed={review.verdict === "ok"} onClick={() => onChange({ verdict: review.verdict === "ok" ? null : "ok" })}
        className={`min-h-11 px-4 rounded-full border-2 font-semibold cursor-pointer ${review.verdict === "ok" ? "bg-ok border-ok text-white" : "bg-surface border-line"}`}>✓ Klopt</button>
      <button type="button" aria-pressed={review.verdict === "fout"} onClick={() => onChange({ verdict: review.verdict === "fout" ? null : "fout" })}
        className={`min-h-11 px-4 rounded-full border-2 font-semibold cursor-pointer ${review.verdict === "fout" ? "bg-wrong border-wrong text-white" : "bg-surface border-line"}`}>Klopt niet</button>
      <label htmlFor={`comment-${note}`} className="sr-only">Opmerking bij {withOctave(note)}</label>
      <input id={`comment-${note}`} key={note} defaultValue={review.comment}
        placeholder="Opmerking, bijv. welke klep ontbreekt"
        onBlur={(e) => { if (e.target.value !== review.comment) onChange({ comment: e.target.value }); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className="flex-1 min-w-[180px] min-h-11 rounded-xl border-2 border-line bg-surface px-3 text-[15px]" />
    </div>
  );
}

function ReviewSummary({ instrument, notes, reviews, onClear }: { instrument: Instrument; notes: NoteId[]; reviews: ReviewMap; onClear: () => void }) {
  const [state, setState] = useState<"" | "copied" | "manual" | "confirm">("");
  const ok = notes.filter((n) => reviews[n]?.verdict === "ok");
  const wrong = notes.filter((n) => reviews[n]?.verdict === "fout");
  const open = notes.filter((n) => !reviews[n]?.verdict);
  const commentOnly = notes.filter((n) => !reviews[n]?.verdict && reviews[n]?.comment);

  const report = [
    `Notenkraker – controle grepen ${instrument.name} (${new Date().toLocaleDateString("nl-NL")})`,
    `${ok.length} klopt, ${wrong.length} klopt niet, ${open.length} nog niet bekeken (van ${notes.length}).`,
    "",
    "KLOPT NIET",
    ...(wrong.length ? wrong.map((n) => `- ${withOctave(n)} [${(instrument.fingerings[n]?.[0] ?? []).join(" ")}]: ${reviews[n]?.comment || "(geen opmerking)"}`) : ["- geen"]),
    ...(commentOnly.length ? ["", "OPMERKINGEN ZONDER OORDEEL", ...commentOnly.map((n) => `- ${withOctave(n)}: ${reviews[n]!.comment}`)] : []),
    "",
    `KLOPT: ${ok.map(withOctave).join(", ") || "-"}`,
    `NOG NIET BEKEKEN: ${open.map(withOctave).join(", ") || "-"}`,
  ].join("\n");

  async function copy() {
    try { await navigator.clipboard.writeText(report); setState("copied"); }
    catch { setState("manual"); }
  }

  return (
    <div className="ml-auto flex items-center gap-2">
      <div className="flex flex-col gap-1 min-w-[120px]">
        <span className="text-sm text-muted tabular-nums leading-none">Controle {ok.length + wrong.length}/{notes.length}{wrong.length ? ` · ${wrong.length} fout` : ""}</span>
        <div className="h-2 rounded-full bg-line overflow-hidden flex" aria-hidden="true">
          <div className="bg-ok" style={{ width: `${(ok.length / notes.length) * 100}%` }} />
          <div className="bg-wrong" style={{ width: `${(wrong.length / notes.length) * 100}%` }} />
        </div>
      </div>
      <button type="button" onClick={copy} className="min-h-11 px-4 rounded-full bg-fg text-bg font-semibold cursor-pointer">{state === "copied" ? "Gekopieerd" : "Kopieer verslag"}</button>
      {state === "confirm" ? (
        <span className="flex gap-1">
          <button type="button" onClick={() => { onClear(); setState(""); }} className="min-h-11 px-3 rounded-full bg-wrong text-white font-semibold cursor-pointer">Ja, wis</button>
          <button type="button" onClick={() => setState("")} className="min-h-11 px-3 rounded-full border-2 border-line font-semibold cursor-pointer">Nee</button>
        </span>
      ) : (
        <button type="button" onClick={() => setState("confirm")} className="min-h-11 px-3 rounded-full border-2 border-line text-muted font-medium cursor-pointer">Wis</button>
      )}
      {state === "manual" && (
        <div className="fixed inset-0 z-10 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Verslag">
          <div className="bg-surface rounded-3xl p-5 w-full max-w-xl flex flex-col gap-3">
            <label htmlFor="report" className="text-sm text-muted">Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.</label>
            <textarea id="report" readOnly value={report} rows={12} className="w-full rounded-xl border-2 border-line bg-bg px-3 py-2 font-mono text-sm" onFocus={(e) => e.target.select()} />
            <button type="button" onClick={() => setState("")} className="self-end min-h-11 px-4 rounded-full bg-fg text-bg font-semibold cursor-pointer">Sluiten</button>
          </div>
        </div>
      )}
    </div>
  );
}
