import { useEffect, useState } from "react";
import clsx from "clsx";
import { instrumentNotes, type NoteId, type StatusMap } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { dateKey, type Homework } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip } from "@/components/ui";
import { useNoteLabels } from "@/components/Huiswerk";

/**
 * Huiswerk geven (AC-113, mock-up docs/mockups/Leraar-Huiswerk.html stap 3), een eigen pagina. Het
 * vorige huiswerk van dezelfde gever staat al ingevuld: alleen aanpassen wat verandert. Opslaan
 * maakt een nieuwe opgave die de vorige van deze gever vervangt; die van een ander blijft staan.
 */
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dateKey(d); };

export function HuiswerkGeven({ studentId, onDone }: { studentId: string; onDone(): void }) {
  const { profile, students } = useApp();
  const student = students.find((s) => s.id === studentId);
  const labels = useNoteLabels(student?.instrumentId ?? "altsax");
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [notes, setNotes] = useState<NoteId[]>([]);
  const [minutes, setMinutes] = useState(15);
  const [days, setDays] = useState(5);
  const [piece, setPiece] = useState("");
  const [pieceNote, setPieceNote] = useState("");
  const [remark, setRemark] = useState("");
  const [due, setDue] = useState(inDays(7));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void client.notes.list(studentId).then((ns) => setStatuses(Object.fromEntries(ns.map((n) => [n.noteId, n.status]))));
    // het vorige huiswerk van mij als begin; de einddatum begint opnieuw over een week
    void client.homework.list(studentId).then((list) => {
      const prev: Homework | undefined = list.find((h) => h.givenBy === profile?.id);
      if (!prev) return;
      setNotes(prev.notes); setMinutes(prev.minutesPerDay); setDays(prev.daysPerWeek);
      setPiece(prev.piece); setPieceNote(prev.pieceNote); setRemark(prev.remark);
    });
  }, [studentId, profile?.id]);

  if (!student) return <p className="text-muted">Laden…</p>;
  const instrument = getInstrument(student.instrumentId);
  const all = instrumentNotes(instrument);
  const toggle = (n: NoteId) => setNotes((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : all.filter((x) => x === n || cur.includes(x))));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await client.homework.give({ studentId, notes, minutesPerDay: minutes, daysPerWeek: days, piece: piece.trim(), pieceNote: pieceNote.trim(), remark: remark.trim(), dueDate: due });
      onDone();
    } catch {
      setError("Opslaan lukte niet. Probeer het nog een keer.");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
        <Caption>Noten om te oefenen</Caption>
        <div className="flex flex-wrap gap-1.5">
          {notes.map((n) => (
            <button key={n} type="button" onClick={() => toggle(n)} aria-label={`${labels[n]} weghalen`}
              className="rounded-xl px-3 py-1.5 font-bold bg-les text-fg cursor-pointer">{labels[n]}</button>
          ))}
          <button type="button" onClick={() => setPicking(!picking)} aria-expanded={picking}
            className="rounded-xl px-3 py-1.5 font-medium border-2 border-dashed border-line text-muted bg-surface cursor-pointer">{picking ? "Klaar" : "+ noot"}</button>
        </div>
        <span className="text-xs text-muted">{notes.length ? "Tik op een noot om hem weg te halen. " : ""}De noten komen op “in de les” en vaker in het spel.</span>
        {picking && (
          <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
            {all.map((n) => (
              <button key={n} type="button" onClick={() => toggle(n)} aria-pressed={notes.includes(n)}
                className={clsx("rounded-xl px-2.5 py-1 text-sm font-semibold cursor-pointer border-2",
                  notes.includes(n) ? "bg-les border-les" : statuses[n] === "kent" ? "bg-kent-soft border-kent-soft" : "bg-surface border-line")}>
                {labels[n]}{statuses[n] === "kent" ? " ✓" : ""}
              </button>
            ))}
            <span className="basis-full text-xs text-muted">✓ = kent {student.name} al</span>
          </div>
        )}
      </section>

      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
        <Caption>Oefendoel</Caption>
        <Stepper label="Minuten per dag" value={minutes} min={5} max={120} step={5} onChange={setMinutes} />
        <Stepper label="Dagen per week" value={days} min={1} max={7} step={1} onChange={setDays} />
        <span className="text-xs text-muted">Telt: notenspel en vrij oefenen (de gespeelde tijd)</span>
      </section>

      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
        <Caption>Stuk of oefening</Caption>
        <input value={piece} onChange={(e) => setPiece(e.target.value)} placeholder="Bijv. Toonladder G groot" aria-label="Stuk of oefening" maxLength={200} className={field} />
        <input value={pieceNote} onChange={(e) => setPieceNote(e.target.value)} placeholder="Uitleg, bijv. “langzaam, 2× per dag”" aria-label="Uitleg" maxLength={500} className={field} />
      </section>

      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
        <Caption>Opmerking</Caption>
        <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} aria-label="Opmerking" maxLength={1000}
          placeholder={`Iets voor ${student.name}, bijv. “Let op je ademhaling”`} className={clsx(field, "resize-y")} />
      </section>

      <section className="rounded-3xl bg-surface p-4 flex items-center justify-between gap-3">
        <label htmlFor="due" className="text-sm">Loopt tot</label>
        <input id="due" type="date" value={due} min={inDays(0)} onChange={(e) => e.target.value && setDue(e.target.value)} className={clsx(field, "w-auto font-semibold")} />
      </section>
      <p className="text-xs text-muted text-center -mt-2 m-0">Standaard over een week. Verschuift de les? Pas de datum aan.</p>

      {error && <p className="text-sm text-wrong m-0">{error}</p>}
      <Chip primary disabled={busy} onClick={() => void save()} className="py-3 text-lg">{busy ? "Opslaan…" : `Opslaan en naar ${student.name} sturen`}</Chip>
    </div>
  );
}

const field = "w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]";

function Caption({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

function Stepper({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange(v: number): void }) {
  const btn = "w-10 h-10 rounded-full bg-bg font-bold text-lg cursor-pointer disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2" role="group" aria-label={label}>
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} aria-label={`${label} minder`}>−</button>
        <b className="text-xl min-w-14 text-center" aria-live="polite">{value}</b>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} aria-label={`${label} meer`}>+</button>
      </div>
    </div>
  );
}
