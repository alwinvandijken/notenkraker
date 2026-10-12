import { useEffect, useState } from "react";
import clsx from "clsx";
import { instrumentNotes, type NoteId, type StatusMap } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { dateKey, dueLabel, type BankTask, type Book, type Homework, type HomeworkTemplate } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip } from "@/components/ui";
import { useNoteLabels } from "@/components/Huiswerk";
import { BankLijst, draftFromBank, draftFromTask, newDraft, OpdrachtenEditor, toInput, type TaskDraft } from "@/components/Opdrachten";

/**
 * Huiswerk geven (AC-113, mock-up docs/mockups/Leraar-Huiswerk.html stap 3), een eigen pagina. Het
 * vorige huiswerk van dezelfde gever staat al ingevuld: alleen aanpassen wat verandert. Opslaan
 * maakt een nieuwe opgave die de vorige van deze gever vervangt; die van een ander blijft staan.
 * Voor meerdere leerlingen tegelijk (AC-117, desktop) krijgt elke leerling een eigen kopie. Bovenaan
 * staan de eigen sjablonen: één tik vult het formulier; onderaan kun je de opgave als sjabloon bewaren.
 * Het oude veld "stuk of oefening" is opgegaan in de opdrachten (AC-118): stukken met boekverwijzing
 * en opdrachten om af te vinken, nieuw of uit de eigen opdrachtenbank.
 *
 * AC-120 PR 6 (mock-up docs/ux-review/vandaag.html "Ouder en leraar"): in drie stappen, Wat (noten en
 * opdrachten) · Doel (minuten, dagen, tot wanneer) · Versturen (opmerking, overzicht). Op een breed
 * scherm staat de bibliotheek naast stap 1, zodat je een opdracht met één tik toevoegt.
 */
type Stap = 1 | 2 | 3;
const STAPPEN: Array<[Stap, string]> = [[1, "Wat"], [2, "Doel"], [3, "Versturen"]];
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dateKey(d); };

export function HuiswerkGeven({ studentIds, onDone }: { studentIds: string[]; onDone(): void }) {
  const { profile, students } = useApp();
  const chosen = students.filter((s) => studentIds.includes(s.id));
  const student = chosen[0];
  const studentId = studentIds.length === 1 ? studentIds[0]! : null;
  const labels = useNoteLabels(student?.instrumentId ?? "altsax");
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [notes, setNotes] = useState<NoteId[]>([]);
  const [minutes, setMinutes] = useState(15);
  const [days, setDays] = useState(5);
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [bank, setBank] = useState<BankTask[]>([]);
  const [remark, setRemark] = useState("");
  const [due, setDue] = useState(inDays(7));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<HomeworkTemplate[]>([]);
  const [asTemplate, setAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [stap, setStap] = useState<Stap>(1);

  useEffect(() => {
    void client.homework.templates().then(setTemplates).catch(() => setTemplates([]));
    void client.bank.list().then(setBank).catch(() => setBank([]));
  }, []);
  useEffect(() => {
    if (!studentId) return;
    void client.notes.list(studentId).then((ns) => setStatuses(Object.fromEntries(ns.map((n) => [n.noteId, n.status]))));
    // het vorige huiswerk van mij als begin; de einddatum begint opnieuw over een week
    void Promise.all([client.homework.list(studentId), client.books.list().catch(() => [] as Book[])]).then(([list, myBooks]) => {
      setBooks(myBooks);
      const prev: Homework | undefined = list.find((h) => h.givenBy === profile?.id);
      if (!prev) return;
      setNotes(prev.notes); setMinutes(prev.minutesPerDay); setDays(prev.daysPerWeek); setRemark(prev.remark);
      setTasks([...legacyPiece(prev.piece, prev.pieceNote), ...prev.tasks.map((t) => draftFromTask(t, myBooks))]);
    }).catch(() => { /* niets om in te vullen */ });
  }, [studentId, profile?.id]);
  useEffect(() => { if (!studentId) void client.books.list().then(setBooks).catch(() => setBooks([])); }, [studentId]);

  if (!student) return <p className="text-muted">Laden…</p>;
  const who = studentId ? student.name : `${chosen.length} leerlingen`;
  const use = (t: HomeworkTemplate) => {
    setNotes(t.notes); setMinutes(t.minutesPerDay); setDays(t.daysPerWeek); setRemark(t.remark);
    setTasks([...legacyPiece(t.piece, t.pieceNote), ...t.tasks.map((x) => newDraft(x.kind, x))]);
  };
  const instrument = getInstrument(student.instrumentId);
  const all = instrumentNotes(instrument);
  const toggle = (n: NoteId) => setNotes((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : all.filter((x) => x === n || cur.includes(x))));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      const filled = tasks.filter((t) => t.title.trim());
      const input = { notes, minutesPerDay: minutes, daysPerWeek: days, remark: remark.trim(), dueDate: due };
      // eerst nieuwe opdrachten in de bank, zodat het huiswerk ernaar verwijst
      const withBank = await Promise.all(filled.map(async (t) => (t.toBank && !t.bankId
        ? { ...t, bankId: (await client.bank.save({ ...toInput(t), categories: t.categories })).id } : t)));
      await client.homework.giveWithTasks(studentIds, input, withBank.map(toInput));
      if (asTemplate) {
        const name = templateName.trim() || `${filled[0]?.title.trim() || "Huiswerk"}, ${minutes} min`;
        await client.homework.saveTemplate({ name, notes, minutesPerDay: minutes, daysPerWeek: days, piece: "", pieceNote: "", remark: input.remark, tasks: withBank.map(toInput) });
      }
      onDone();
    } catch {
      setError("Opslaan lukte niet. Probeer het nog een keer.");
      setBusy(false);
    }
  };

  const filled = tasks.filter((t) => t.title.trim());
  const naar = (n: Stap) => { setStap(n); window.scrollTo(0, 0); };
  return (
    <div className={clsx("grid gap-4 items-start", stap === 1 && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
      <div className="flex flex-col gap-4 min-w-0 max-w-[640px]">
        <ol aria-label="Stappen" className="m-0 p-0 list-none flex gap-2">
          {STAPPEN.map(([n, naam]) => (
            <li key={n} className="flex-1">
              <button type="button" onClick={() => naar(n)} aria-current={stap === n ? "step" : undefined}
                className={clsx("w-full flex items-center justify-center gap-2 rounded-full px-3 py-2 font-display font-semibold cursor-pointer border-2",
                  stap === n ? "bg-fg text-bg border-fg" : n < stap ? "bg-surface border-ok text-ok" : "bg-surface border-line text-muted")}>
                <span aria-hidden="true">{n < stap ? "✓" : n}</span>{naam}
              </button>
            </li>
          ))}
        </ol>
        {!studentId && <p className="m-0 text-muted">Voor {chosen.map((c) => c.name).join(", ")}. Iedereen krijgt een eigen kopie.</p>}

        {stap === 1 && (
          <>
            {templates.length > 0 && (
              <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
                <Caption>Sjabloon gebruiken</Caption>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => (
                    <button key={t.id} type="button" onClick={() => use(t)} title={`${t.minutesPerDay} min × ${t.daysPerWeek} dagen`}
                      className="rounded-full border-2 border-line bg-surface px-3 py-1.5 text-sm font-semibold cursor-pointer hover:border-kent">{t.name}</button>
                  ))}
                </div>
              </section>
            )}
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
                  {studentId && <span className="basis-full text-xs text-muted">✓ = kent {student.name} al</span>}
                </div>
              )}
            </section>
            <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
              <Caption>Opdrachten</Caption>
              <OpdrachtenEditor tasks={tasks} onChange={setTasks} books={books} bank={bank} bankBeside />
            </section>
            <Chip primary onClick={() => naar(2)} className="py-3 text-lg">Volgende: doel</Chip>
          </>
        )}

        {stap === 2 && (
          <>
            <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
              <Caption>Oefendoel</Caption>
              <Stepper label="Minuten per dag" value={minutes} min={5} max={120} step={5} onChange={setMinutes} />
              <Stepper label="Dagen per week" value={days} min={1} max={7} step={1} onChange={setDays} />
              <span className="text-xs text-muted">Telt: notenspel, vrij oefenen en opnames (de gespeelde tijd)</span>
            </section>
            <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="due" className="text-sm">Loopt tot</label>
                <input id="due" type="date" value={due} min={inDays(0)} onChange={(e) => e.target.value && setDue(e.target.value)} className={clsx(field, "w-auto font-semibold")} />
              </div>
              <span className="text-xs text-muted">Standaard over een week. Verschuift de les? Pas de datum aan.</span>
            </section>
            <div className="flex gap-2">
              <Chip onClick={() => naar(1)} className="py-3">← Wat</Chip>
              <Chip primary onClick={() => naar(3)} className="flex-1 py-3 text-lg">Volgende: versturen</Chip>
            </div>
          </>
        )}

        {stap === 3 && (
          <>
            <section aria-label="Overzicht" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
              <Caption>Overzicht</Caption>
              {notes.length > 0 && <div className="flex flex-wrap gap-1.5">{notes.map((n) => <span key={n} className="rounded-xl px-2.5 py-1 font-bold bg-les text-fg text-sm">{labels[n]}</span>)}</div>}
              {filled.map((t) => <span key={t.key} className="text-sm">{t.kind === "stuk" ? "🎵" : "✓"} <b>{t.title.trim()}</b>{t.recording ? " · 🎙️ opnemen" : ""}</span>)}
              <span className="text-sm text-muted">{minutes} min per dag, {days} {days === 1 ? "dag" : "dagen"} per week · tot {dueLabel(due)}</span>
              {notes.length === 0 && filled.length === 0 && <span className="text-sm text-muted">Nog geen noten of opdrachten; alleen het oefendoel.</span>}
            </section>
            <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
              <Caption>Opmerking</Caption>
              <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} aria-label="Opmerking" maxLength={1000}
                placeholder={`Iets voor ${studentId ? student.name : "de leerlingen"}, bijv. “Let op je ademhaling”`} className={clsx(field, "resize-y")} />
            </section>
            <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} className="w-5 h-5 accent-[var(--color-ok)]" />
                Ook bewaren als sjabloon
              </label>
              {asTemplate && <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={100} aria-label="Naam van het sjabloon"
                placeholder={`${tasks[0]?.title.trim() || "Huiswerk"}, ${minutes} min`} className={field} />}
            </section>
            {error && <p className="text-sm text-wrong m-0">{error}</p>}
            <div className="flex gap-2">
              <Chip onClick={() => naar(2)} className="py-3">← Doel</Chip>
              <Chip primary disabled={busy} onClick={() => void save()} className="flex-1 py-3 text-lg">{busy ? "Opslaan…" : `Opslaan en naar ${who} sturen`}</Chip>
            </div>
          </>
        )}
      </div>

      {stap === 1 && (
        <aside aria-label="Uit de bibliotheek" className="hidden lg:flex rounded-3xl bg-surface p-4 flex-col gap-2.5 sticky top-4">
          <Caption>Uit de bibliotheek</Caption>
          <BankLijst bank={bank} books={books} added={tasks.map((t) => t.bankId).filter((x): x is string => !!x)}
            onAdd={(b) => setTasks((cur) => [...cur, draftFromBank(b)])} />
        </aside>
      )}
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

/** huiswerk van vóór de opdrachten (één "stuk of oefening") als een opdracht "stuk spelen" */
function legacyPiece(piece: string, pieceNote: string): TaskDraft[] {
  return piece.trim() ? [newDraft("stuk", { title: pieceNote.trim() ? `${piece.trim()}, ${pieceNote.trim()}` : piece.trim() })] : [];
}
