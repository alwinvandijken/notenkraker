import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  AGE_BANDS, idToMidi, noteLadder, noteName, parseId, PlacementTest, placementStart, type AgeBand, type Experience, type NoteId, type StatusMap,
} from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import type { Student } from "@notenkraker/client";
import { client } from "@/lib/client";
import { distinctLabels } from "@/lib/noten";
import { StaffRow } from "@/components/Staff";

/**
 * Kennismaking (AC-115, mock-up docs/mockups/Kennismaking.html): leeftijdsgroep, hoe lang al
 * spelen en een korte notentoets, elk op een eigen pagina. Al beantwoorde vragen slaan we over.
 * `who = "ouder"`: een ouder beantwoordt alleen leeftijd en ervaring over het kind; de toets doet
 * het kind zelf, de eerste keer dat het gaat oefenen.
 */
type Step = "leeftijd" | "ervaring" | "uitleg" | "toets" | "uitslag";

const AGE: Record<AgeBand, { icon: string; label: string }> = {
  "6-8": { icon: "🧸", label: "6 – 8 jaar" }, "9-12": { icon: "🎒", label: "9 – 12 jaar" },
  "13-17": { icon: "🎧", label: "13 – 17 jaar" }, "18+": { icon: "☕", label: "18 jaar of ouder" },
};
const EXP: Array<{ value: Experience; icon: string; label: string; sub: string }> = [
  { value: "nieuw", icon: "🌱", label: "Net begonnen", sub: "Ik ken nog bijna geen noten" },
  { value: "lt1", icon: "🌿", label: "Minder dan een jaar", sub: "Ik ken de eerste noten" },
  { value: "1-3", icon: "🌳", label: "1 tot 3 jaar", sub: "Ik lees al aardig wat noten" },
  { value: "gt3", icon: "🏆", label: "Langer dan 3 jaar", sub: "Ik lees de meeste noten" },
];
/** knoppen in de toets: stamtonen, en de kruizen en mollen eronder */
const NATURALS = ["c", "d", "e", "f", "g", "a", "b"];
const ALTERED = ["cis", "es", "fis", "gis", "bes"];

export function Kennismaking({ student, statuses, who = "zelf", onDone }: {
  student: Student; statuses: StatusMap; who?: "zelf" | "ouder"; onDone(): void;
}) {
  const instrument = getInstrument(student.instrumentId);
  const ladder = useMemo(() => noteLadder(instrument.range, instrument.starterNotes), [instrument]);
  const first: Step = !student.ageBand ? "leeftijd" : !student.experience && who === "zelf" ? "ervaring" : who === "ouder" ? "ervaring" : "uitleg";
  const [step, setStep] = useState<Step>(first);
  const [experience, setExperience] = useState<Experience | null>(student.experience ?? null);
  const [test, setTest] = useState<PlacementTest | null>(null);
  const [, rerender] = useState(0);
  const [known, setKnown] = useState<Set<NoteId>>(new Set());
  const [busy, setBusy] = useState(false);
  const theyName = who === "ouder" ? student.name : null;
  const total = who === "ouder" ? 2 : 3;
  const stepNo = step === "leeftijd" ? 1 : step === "ervaring" ? 2 : 3;

  const save = (patch: Partial<Student>) => client.students.update(student.id, patch);
  const finish = async (statusUpdates: Array<[NoteId, StatusMap[string] | null]>) => {
    setBusy(true);
    for (const [n, st] of statusUpdates) await client.notes.setStatus(student.id, n, st);
    if (who === "zelf") await save({ onboardedAt: new Date().toISOString() });
    onDone();
  };
  /** overslaan of net begonnen: de startnoten op "Komt nog", als er nog niets staat */
  const skip = () => void finish(Object.keys(statuses).length ? [] : instrument.starterNotes.map((n) => [n, "moet"]));

  async function pickAge(band: AgeBand) { await save({ ageBand: band }); setStep(student.experience && who === "zelf" ? "uitleg" : "ervaring"); }
  async function pickExperience(e: Experience) {
    setExperience(e);
    await save({ experience: e });
    if (who === "ouder") { onDone(); return; }
    if (placementStart(e) === null) { skip(); return; }
    setStep("uitleg");
  }
  function startTest() { setTest(new PlacementTest(ladder, placementStart(experience ?? "lt1") ?? 0)); setStep("toets"); }
  function answer(name: string | null) {
    if (!test) return;
    const note = test.current()!;
    test.answer(name !== null && noteName(parseId(note), "nl") === name);
    if (test.done) { setKnown(new Set(test.result())); setStep("uitslag"); } else rerender((x) => x + 1);
  }
  function confirm() {
    const shown = shownNotes(ladder, known);
    void finish(shown.flatMap((n): Array<[NoteId, StatusMap[string] | null]> => {
      if (known.has(n)) return statuses[n] === "les" || statuses[n] === "kent" ? [] : [[n, "kent"]];
      return statuses[n] === "kent" ? [[n, null]] : [];
    }));
  }

  const shown = shownNotes(ladder, known);
  const labels = distinctLabels(shown, instrument.starterNotes);

  const back = step === "ervaring" && !student.ageBand ? () => setStep("leeftijd")
    : step === "uitleg" ? () => setStep("ervaring") : step === "uitslag" ? () => setStep("uitleg") : null;

  return (
    <div className="max-w-[520px] mx-auto flex flex-col gap-4 pb-8">
      {(step === "leeftijd" || step === "ervaring" || step === "uitleg") && (
        <>
          {back ? <button type="button" onClick={back} className="self-start text-sm font-semibold text-muted bg-transparent cursor-pointer -ml-1 px-1">← Terug</button> : <span />}
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => <i key={i} className={clsx("flex-1 h-1.5 rounded-full", i < stepNo ? "bg-fg" : "bg-line")} />)}
          </div>
          <p className="text-xs text-muted m-0">Even kennismaken · {stepNo} van {total}</p>
        </>
      )}

      {step === "leeftijd" && (
        <>
          <h2 className="font-display font-bold text-3xl m-0">{theyName ? `Hoe oud is ${theyName}?` : "Hoe oud ben je?"}</h2>
          <div className="grid grid-cols-2 gap-3">
            {AGE_BANDS.map((b) => (
              <button key={b} type="button" disabled={busy} onClick={() => void pickAge(b)}
                className={clsx("rounded-3xl bg-surface p-4 flex flex-col items-start gap-2 font-display font-semibold text-lg text-left cursor-pointer border-2", student.ageBand === b ? "border-fg" : "border-transparent")}>
                <span className="w-12 h-12 rounded-2xl bg-kent-soft flex items-center justify-center text-2xl" aria-hidden="true">{AGE[b].icon}</span>{AGE[b].label}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted m-0">We vragen alleen de groep, niet de precieze leeftijd.</p>
          {who === "zelf" && <SkipButton onClick={skip} disabled={busy} />}
        </>
      )}

      {step === "ervaring" && (
        <>
          <h2 className="font-display font-bold text-3xl m-0">{theyName ? `Hoe lang speelt ${theyName} al ${instrument.name.toLowerCase()}?` : `Hoe lang speel je al ${instrument.name.toLowerCase()}?`}</h2>
          <div className="flex flex-col gap-2.5">
            {EXP.map((e) => (
              <button key={e.value} type="button" disabled={busy} onClick={() => void pickExperience(e.value)}
                className={clsx("rounded-3xl bg-surface p-3.5 flex items-center gap-3 text-left cursor-pointer border-2", experience === e.value ? "border-fg" : "border-transparent")}>
                <span className="w-12 h-12 rounded-2xl bg-kent-soft flex items-center justify-center text-2xl shrink-0" aria-hidden="true">{e.icon}</span>
                <span><b className="font-display text-lg block">{e.label}</b><span className="text-sm text-muted">{e.sub}</span></span>
              </button>
            ))}
          </div>
          {who === "zelf" && <SkipButton onClick={skip} disabled={busy} />}
        </>
      )}

      {step === "uitleg" && (
        <>
          <h2 className="font-display font-bold text-3xl m-0">Welke noten ken je al?</h2>
          <div className="rounded-3xl bg-surface p-4 leading-relaxed">
            Ik laat je <b>8 noten</b> zien. Tik de naam van de noot.<br />Weet je het niet? Tik dan <b>Weet ik niet</b>. Dat is helemaal goed: dan weten we waar je kunt beginnen.
          </div>
          <p className="rounded-3xl bg-surface p-4 text-sm text-muted m-0">⏱️ Geen tijd, geen levens. Duurt ongeveer een minuut.</p>
          <button type="button" onClick={startTest} className="min-h-12 rounded-full bg-accent text-white font-display font-bold text-lg cursor-pointer">Begin</button>
          <button type="button" onClick={() => { setKnown(new Set(Object.entries(statuses).filter(([, st]) => st === "kent").map(([n]) => n))); setStep("uitslag"); }}
            className="min-h-12 rounded-full bg-surface border-2 border-line font-display font-bold cursor-pointer">Zelf aanvinken</button>
          <SkipButton onClick={skip} disabled={busy} />
        </>
      )}

      {step === "toets" && test && test.current() && (
        <>
          <div className="flex gap-1.5 justify-center" aria-label={`Noot ${test.asked.length + 1} van 8`}>
            {Array.from({ length: 8 }, (_, i) => {
              const a = test.asked[i];
              return <i key={i} className={clsx("w-3 h-3 rounded-full", a ? (a.correct ? "bg-ok" : "bg-les") : i === test.asked.length ? "bg-line outline-2 outline-fg outline-offset-2" : "bg-line")} />;
            })}
          </div>
          <div className="text-fg"><StaffRow clef={instrument.clef} height={200} showNames={false} notes={[{ id: test.current()! }]} /></div>
          <p className="text-center text-sm text-muted m-0">Welke noot is dit?</p>
          <div className="grid grid-cols-4 gap-2">
            {NATURALS.map((n) => <NameKey key={n} name={n} onClick={() => answer(n)} />)}
            <button type="button" onClick={() => answer(null)} className="rounded-2xl bg-surface border-2 border-line text-sm font-semibold text-muted cursor-pointer leading-tight">Weet ik niet</button>
          </div>
          {ladder.indexOf(test.current()!) >= ladder.findIndex((n) => parseId(n).accidental !== "") - 4 && (
            <div className="grid grid-cols-5 gap-2">{ALTERED.map((n) => <NameKey key={n} name={n} small onClick={() => answer(n)} />)}</div>
          )}
        </>
      )}

      {step === "uitslag" && (
        <>
          {back && <button type="button" onClick={back} className="self-start text-sm font-semibold text-muted bg-transparent cursor-pointer -ml-1 px-1">← Terug</button>}
          <h2 className="font-display font-bold text-3xl m-0">{known.size ? "Mooi! Dit ken je al" : "Welke noten ken je al?"}</h2>
          <p className="text-muted m-0">{known.size ? "Klopt het niet helemaal? " : ""}Tik een noot om hem aan of uit te zetten.</p>
          <div className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
            <NoteGroup title="Kent al" notes={byPitch(shown.filter((n) => known.has(n)))} labels={labels} on onToggle={(n) => setKnown(toggle(known, n))} />
            <NoteGroup title="Komt nog" notes={byPitch(shown.filter((n) => !known.has(n)))} labels={labels} onToggle={(n) => setKnown(toggle(known, n))} />
          </div>
          <p className="rounded-3xl bg-surface p-4 text-sm m-0">🎯 Je begint met <b>{known.size || "de eerste"} {known.size === 1 ? "noot" : "noten"}</b>. Nieuwe noten komen erbij als je ze in het spel goed doet, of als je leraar ze in de les zet.</p>
          <button type="button" disabled={busy} onClick={confirm} className="min-h-12 rounded-full bg-accent text-white font-display font-bold text-lg cursor-pointer disabled:opacity-60">Klaar, aan de slag!</button>
        </>
      )}
    </div>
  );
}

/** wat de uitslag laat zien: de bekende noten en de eerstvolgende 6 op de ladder */
function shownNotes(ladder: NoteId[], known: Set<NoteId>): NoteId[] {
  const last = Math.max(4, ...[...known].map((n) => ladder.indexOf(n)));
  return ladder.slice(0, last + 7);
}

function toggle(set: Set<NoteId>, n: NoteId) { const next = new Set(set); if (next.has(n)) next.delete(n); else next.add(n); return next; }

const byPitch = (notes: NoteId[]) => [...notes].sort((a, b) => idToMidi(a) - idToMidi(b));

function NoteGroup({ title, notes, labels, on, onToggle }: { title: string; notes: NoteId[]; labels: Record<NoteId, string>; on?: boolean; onToggle(n: NoteId): void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</span>
      {notes.length === 0 && <span className="text-sm text-muted">Nog geen</span>}
      <div className="flex flex-wrap gap-2">
        {notes.map((n) => (
          <button key={n} type="button" aria-pressed={Boolean(on)} onClick={() => onToggle(n)}
            className={clsx("min-w-12 h-11 px-3 rounded-xl font-bold border-2 cursor-pointer", on ? "bg-kent border-kent text-white" : "bg-surface border-line")}>{labels[n]}</button>
        ))}
      </div>
    </div>
  );
}

function NameKey({ name, small, onClick }: { name: string; small?: boolean; onClick(): void }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx("font-display font-extrabold rounded-2xl text-white bg-key cursor-pointer shadow-[0_4px_0_var(--color-key-shadow)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-key-shadow)]",
        small ? "text-base py-2.5" : "text-2xl py-3.5")}>{name.charAt(0).toUpperCase() + name.slice(1)}</button>
  );
}

function SkipButton({ onClick, disabled }: { onClick(): void; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="self-center text-sm font-semibold text-muted bg-transparent cursor-pointer underline underline-offset-4">Overslaan</button>;
}
