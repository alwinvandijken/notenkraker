import { useMemo, useState } from "react";
import { instrumentNotes, midiToPitch, noteName, parseId, soundingMidi, type Instrument, type NoteId, type NoteStatus } from "@notenkraker/core";
import { playMidi } from "@/audio/synth";
import { useReviews, useStatuses, usePref, type ReviewMap } from "@/lib/poc";
import { StaffNote, StaffRow } from "@/components/Staff";
import { Fingering } from "@/components/Fingering";
import { Card, Segmented } from "@/components/ui";

/**
 * Proefconcept (AC-107): alleen de grepentabel, zonder leerling of spel.
 * Bedoeld om de grepen per noot door een docent te laten controleren.
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
    <div className="flex flex-col gap-4 lg:gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={setFilter} label="Welke noten"
          options={FILTERS.map(([v, t]) => [v, `${t} (${counts[v]})`] as [Filter, string])} />
        <span className="ml-auto"><Segmented value={view} onChange={setView} label="Weergave notenkiezer" options={[["buttons", "Knoppen"], ["staff", "Notenbalk"]]} /></span>
      </div>

      <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(320px,400px)_1fr]">
        <Card className="order-2 lg:order-1 lg:row-span-2 flex flex-col items-center justify-center gap-3">
          <h2 className="sr-only">Greep</h2>
          {options.length > 1 && (
            <Segmented value={String(alt)} onChange={(v) => setAlt(Number(v))} label="Greep"
              options={options.map((_, i) => [String(i), i === 0 ? "Gewone greep" : `Alternatief ${i}`] as [string, string])} />
          )}
          <div className="w-full max-w-[340px] [&_svg]:max-w-none"><Fingering instrument={instrument} pressed={fingering} needed={needed} showAll={showAll} /></div>
          <p className="text-center text-[17px] leading-snug">
            {keyNames.length
              ? <>Druk in: {keyNames.map((k, i) => <b key={i}>{k}{i < keyNames.length - 1 ? ", " : ""}</b>)}</>
              : <>Niets indrukken, alles <b>open</b></>}
          </p>
          <button type="button" onClick={() => setShowAll((v) => !v)} aria-pressed={showAll}
            className="min-h-11 px-4 rounded-full border-2 border-dashed border-line text-muted text-sm font-medium cursor-pointer">
            {showAll ? "Alleen kleppen voor mijn noten" : "Toon alle kleppen"}
          </button>
        </Card>

        <Card className="order-1 lg:order-2 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl border-2 ${statusClass(statuses[current])}`}>
              {STATUS.find(([v]) => v === (statuses[current] ?? ""))?.[1]}
            </span>
            <button type="button" onClick={() => playMidi(sounding, 1.2)}
              className="ml-auto inline-flex items-center gap-2 min-h-12 px-5 rounded-full border-2 border-fg font-semibold cursor-pointer">
              <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true"><path d="M3 8h4l5-4v14l-5-4H3z" fill="currentColor" /><path d="M15 7.5a5 5 0 010 7M17.5 5a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
              Laat horen
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] items-center">
            <StaffNote note={current} clef={instrument.clef} color="var(--color-kent)" />
            <div className="text-center sm:text-left sm:pr-4">
              <div className="font-display font-bold text-[96px] lg:text-[120px] leading-[0.9] tracking-tight">{display(current)}</div>
              {octaveLabel(current, instrument.range) && <div className="text-muted text-lg">{octaveLabel(current, instrument.range)}</div>}
              <div className="text-muted text-sm mt-2">Geschreven {withOctave(current)} · klinkt als {soundingId}</div>
            </div>
          </div>

        </Card>

        <Card className="order-3 flex flex-col gap-4">
          <fieldset className="m-0 p-0 border-0 flex flex-wrap gap-2 items-center">
            <legend className="sr-only">Status van deze noot</legend>
            <span className="text-muted text-sm w-full">Status van deze noot</span>
            {STATUS.map(([v, t]) => {
              const on = (statuses[current] ?? "") === v;
              return (
                <button key={v} type="button" aria-pressed={on} onClick={() => setStatus(current, v || null)}
                  className={`min-h-11 px-4 rounded-full border-2 font-semibold text-[15px] cursor-pointer ${on ? statusClass(v || undefined) + " ring-2 ring-fg ring-offset-2 ring-offset-surface" : "bg-surface border-line text-fg"}`}>{t}</button>
              );
            })}
          </fieldset>

          <ReviewPanel note={current} review={review} onChange={(p) => setReview(current, p)} />
        </Card>
      </div>

      <nav aria-label="Kies een noot" className="flex flex-col gap-3">
        {visible.length === 0 ? (
          <p className="text-muted p-4 rounded-2xl bg-surface">Nog geen noten in deze lijst. Kies "Alle noten" en geef een noot een status.</p>
        ) : view === "buttons" ? (
          <div className="flex flex-wrap gap-2 p-2 rounded-3xl bg-surface">
            {visible.map((n) => {
              const r = reviews[n]?.verdict;
              return (
                <button key={n} type="button" aria-pressed={n === current} onClick={() => select(n)}
                  aria-label={`${withOctave(n)}${r === "ok" ? ", klopt" : r === "fout" ? ", klopt niet" : ""}`}
                  className={`relative w-16 h-16 p-0 rounded-2xl border-2 font-display font-bold cursor-pointer grid place-content-center justify-items-center gap-0.5 aria-pressed:outline-3 aria-pressed:outline-fg aria-pressed:outline-offset-2 ${statusClass(statuses[n])}`}>
                  <span className={`leading-none ${parseId(n).accidental ? "text-lg" : "text-[22px]"}`}>{display(n)}</span>
                  {octaveLabel(n, instrument.range) && <span className="leading-none text-[11px] font-medium opacity-80">{octaveLabel(n, instrument.range)}</span>}
                  {r && <span aria-hidden="true" className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center text-white ${r === "ok" ? "bg-ok" : "bg-wrong"}`}>{r === "ok" ? "✓" : "!"}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <StaffRow clef={instrument.clef} naming="nl" onSelect={(id) => select(id)}
            notes={visible.map((n) => ({ id: n, selected: n === current, sub: octaveLabel(n, instrument.range), color: reviews[n]?.verdict === "fout" ? "var(--color-wrong)" : undefined }))} />
        )}
        <div className="flex justify-center gap-3">
          <button type="button" onClick={() => step(-1)} className="min-h-12 px-6 rounded-full bg-surface font-semibold cursor-pointer">◀ Vorige</button>
          <button type="button" onClick={() => step(1)} className="min-h-12 px-6 rounded-full bg-surface font-semibold cursor-pointer">Volgende ▶</button>
        </div>
      </nav>

      <ReviewSummary instrument={instrument} notes={all} reviews={reviews} onClear={clear} />
    </div>
  );
}

function ReviewPanel({ note, review, onChange }: { note: NoteId; review: ReviewMap[string]; onChange: (p: Partial<ReviewMap[string]>) => void }) {
  return (
    <div className="rounded-2xl bg-bg p-3 flex flex-col gap-2">
      <span className="text-sm font-semibold">Controle door docent: klopt de greep voor {withOctave(note)}?</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={review.verdict === "ok"} onClick={() => onChange({ verdict: review.verdict === "ok" ? null : "ok" })}
          className={`min-h-11 px-4 rounded-full border-2 font-semibold cursor-pointer ${review.verdict === "ok" ? "bg-ok border-ok text-white" : "bg-surface border-line"}`}>✓ Klopt</button>
        <button type="button" aria-pressed={review.verdict === "fout"} onClick={() => onChange({ verdict: review.verdict === "fout" ? null : "fout" })}
          className={`min-h-11 px-4 rounded-full border-2 font-semibold cursor-pointer ${review.verdict === "fout" ? "bg-wrong border-wrong text-white" : "bg-surface border-line"}`}>Klopt niet</button>
      </div>
      <label htmlFor={`comment-${note}`} className="sr-only">Opmerking bij {withOctave(note)}</label>
      <textarea id={`comment-${note}`} key={note} defaultValue={review.comment} rows={2}
        placeholder="Opmerking, bijvoorbeeld welke klep ontbreekt of een betere greep"
        onBlur={(e) => { if (e.target.value !== review.comment) onChange({ comment: e.target.value }); }}
        className="w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]" />
    </div>
  );
}

function ReviewSummary({ instrument, notes, reviews, onClear }: { instrument: Instrument; notes: NoteId[]; reviews: ReviewMap; onClear: () => void }) {
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
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
    try { await navigator.clipboard.writeText(report); setCopied("ok"); }
    catch { setCopied("manual"); }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display font-bold text-xl m-0">Controle</h2>
        <span className="text-muted tabular-nums">{ok.length + wrong.length} van {notes.length} bekeken · {wrong.length} klopt niet</span>
        <span className="ml-auto flex gap-2">
          <button type="button" onClick={copy} className="min-h-11 px-4 rounded-full bg-fg text-bg font-semibold cursor-pointer">{copied === "ok" ? "Gekopieerd" : "Kopieer verslag"}</button>
          <button type="button" onClick={() => { if (window.confirm("Alle controles wissen?")) onClear(); }} className="min-h-11 px-4 rounded-full border-2 border-line font-semibold text-muted cursor-pointer">Wis controle</button>
        </span>
      </div>
      <div className="h-3 rounded-full bg-bg overflow-hidden flex" aria-hidden="true">
        <div className="bg-ok" style={{ width: `${(ok.length / notes.length) * 100}%` }} />
        <div className="bg-wrong" style={{ width: `${(wrong.length / notes.length) * 100}%` }} />
      </div>
      {copied === "manual" && (
        <>
          <label htmlFor="report" className="text-sm text-muted">Kopiëren lukte niet; selecteer de tekst hieronder en kopieer hem zelf.</label>
          <textarea id="report" readOnly value={report} rows={10} className="w-full rounded-xl border-2 border-line bg-bg px-3 py-2 font-mono text-sm" onFocus={(e) => e.target.select()} />
        </>
      )}
    </Card>
  );
}
