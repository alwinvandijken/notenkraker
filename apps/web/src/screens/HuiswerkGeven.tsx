import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { instrumentNotes, type NoteId, type StatusMap } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { dateKey, dueLabel, lessonPeriod, type BankTask, type Book, type Homework, type HomeworkTemplate, type Lesson } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { useWide } from "@/lib/useWide";
import { Chip, Segmented, Week } from "@/components/ui";
import { useNoteLabels } from "@/components/Huiswerk";
import { BankLijst, draftFromBank, draftFromTask, newDraft, OpdrachtenEditor, toInput, type TaskDraft } from "@/components/Opdrachten";

/**
 * Huiswerk geven (AC-113) en aanpassen, per les (0013, besluiten Alwin 12-10-2026).
 *
 * - Nieuw: je kiest "Deze les" of "Volgende les". Heb je voor die les al huiswerk gegeven, dan komen de
 *   opdrachten erbij en blijft de rest van dat huiswerk (doel, vinkjes, opnames, voortgang) zoals het is.
 *   Het formulier begint leeg; "Vorig huiswerk als begin" vult het met je laatste huiswerk.
 * - Aanpassen (`homeworkId`): verandert dat ene huiswerk zonder het opnieuw te beginnen. Een opdracht die
 *   blijft, houdt zijn vinkje en opnames. Stoppen zet de einddatum op gisteren.
 * - Een les loopt van de vaste lesdag van de leerling tot de dag vóór de volgende lesdag.
 *
 * Huiswerk geven gebeurt vooral op de laptop: vanaf 1024 breed staat alles op één pagina naast elkaar
 * (Wat · Bibliotheek · Doel en versturen); smaller in drie stappen.
 */
type Stap = 1 | 2 | 3;
const STAPPEN: Array<[Stap, string]> = [[1, "Wat"], [2, "Doel"], [3, "Versturen"]];
const WEEKDAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const kort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });

export function HuiswerkGeven({ studentIds, homeworkId, onDone }: { studentIds: string[]; homeworkId?: string; onDone(): void }) {
  const { profile, students } = useApp();
  const chosen = students.filter((s) => studentIds.includes(s.id));
  const student = chosen[0];
  const studentId = studentIds.length === 1 ? studentIds[0]! : null;
  const labels = useNoteLabels(student?.instrumentId ?? "altsax");
  const wide = useWide("(min-width: 1024px)");
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [list, setList] = useState<Homework[]>([]);
  const [lesson, setLesson] = useState<Lesson>("deze");
  const [notes, setNotes] = useState<NoteId[]>([]);
  const [minutes, setMinutes] = useState(15);
  const [days, setDays] = useState(5);
  const [tasks, setTasks] = useState<TaskDraft[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [bank, setBank] = useState<BankTask[]>([]);
  const [remark, setRemark] = useState("");
  const [start, setStart] = useState("");
  /** de lesdag van mijn groep met deze leerling (rooster, 0014) */
  const [weekday, setWeekday] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<HomeworkTemplate[]>([]);
  const [asTemplate, setAsTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [stap, setStap] = useState<Stap>(1);
  const [sure, setSure] = useState(false);
  /** opdrachten van de lopende les die meegaan naar de volgende (AC-124) */
  const [carry, setCarry] = useState<string[]>([]);

  useEffect(() => {
    void client.homework.templates().then(setTemplates).catch(() => setTemplates([]));
    void client.bank.list().then(setBank).catch(() => setBank([]));
    void client.books.list().then(setBooks).catch(() => setBooks([]));
  }, []);
  useEffect(() => {
    if (!studentId) return;
    void client.homework.schedule(studentId).then(setWeekday).catch(() => setWeekday(null));
    void client.notes.list(studentId).then((ns) => setStatuses(Object.fromEntries(ns.map((n) => [n.noteId, n.status]))));
    void Promise.all([client.homework.list(studentId, 50), client.books.list().catch(() => [] as Book[])]).then(([all, myBooks]) => {
      setList(all);
      // aanpassen: dat ene huiswerk, met de bestaande opdrachten (die houden hun vinkje en opnames)
      const h = homeworkId ? all.find((x) => x.id === homeworkId) : undefined;
      if (!h) return;
      setNotes(h.notes); setMinutes(h.minutesPerDay); setDays(h.daysPerWeek); setRemark(h.remark); setStart(h.startDate);
      setTasks(h.tasks.map((t) => draftFromTask(t, myBooks, true)));
    }).catch(() => { /* niets om in te vullen */ });
  }, [studentId, homeworkId]);

  if (!student) return <p className="text-muted">Laden…</p>;
  const editing = homeworkId ? list.find((h) => h.id === homeworkId) : undefined;
  if (homeworkId && !editing) return <p className="text-muted">Laden…</p>;
  const who = studentId ? student.name : `${chosen.length} leerlingen`;
  const today = dateKey(new Date());
  const period = lessonPeriod(weekday, lesson);
  /** al huiswerk van mij voor de gekozen les: dan komen de opdrachten erbij */
  /** mijn lopende les met deze leerling: daaruit kun je opdrachten meenemen naar de volgende les */
  const lopend = !editing && studentId && lesson === "volgende"
    ? list.find((h) => h.givenBy === profile?.id && h.status !== "afgezegd" && h.startDate <= today && h.dueDate >= today) : undefined;
  const meegaand = lopend ? lopend.tasks.filter((t) => carry.includes(t.id)) : [];
  const existing = !editing && studentId
    ? list.find((h) => h.givenBy === profile?.id && h.dueDate >= today && (lesson === "deze" ? h.startDate <= today : h.startDate > today))
    : undefined;
  const previous = list.find((h) => h.givenBy === profile?.id);
  const instrument = getInstrument(student.instrumentId);
  const all = instrumentNotes(instrument);
  const toggle = (n: NoteId) => setNotes((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : all.filter((x) => x === n || cur.includes(x))));
  const filled = tasks.filter((t) => t.title.trim());
  const use = (t: { notes: NoteId[]; minutesPerDay: number; daysPerWeek: number; remark: string; piece: string; pieceNote: string }, fromTasks: TaskDraft[]) => {
    setNotes(t.notes); setMinutes(t.minutesPerDay); setDays(t.daysPerWeek); setRemark(t.remark);
    setTasks([...legacyPiece(t.piece, t.pieceNote), ...fromTasks]);
  };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      // eerst nieuwe opdrachten in de bank, zodat het huiswerk ernaar verwijst
      const withBank = await Promise.all(filled.map(async (t) => (t.toBank && !t.bankId
        ? { ...t, bankId: (await client.bank.save({ ...toInput(t), categories: t.categories })).id } : t)));
      const input = { notes, minutesPerDay: minutes, daysPerWeek: days, remark: remark.trim() };
      if (editing) await client.homework.update(editing.id, { ...input, startDate: start }, withBank.map(toInput));
      else await client.homework.give(studentIds, lesson, input, withBank.map(toInput), studentId ? { [studentId]: meegaand.map((t) => t.id) } : {});
      if (asTemplate) {
        const name = templateName.trim() || `${filled[0]?.title.trim() || "Huiswerk"}, ${minutes} min`;
        await client.homework.saveTemplate({ name, notes, minutesPerDay: minutes, daysPerWeek: days, piece: "", pieceNote: "", remark: input.remark, tasks: withBank.map((t) => ({ ...toInput(t), id: undefined })) });
      }
      onDone();
    } catch {
      setError("Opslaan lukte niet. Probeer het nog een keer.");
      setBusy(false);
    }
  };
  const stop = async () => {
    if (!editing) return;
    setBusy(true);
    try { await client.homework.end(editing.id); onDone(); } catch { setError("Stoppen lukte niet."); setBusy(false); }
  };

  // ── de blokken ───────────────────────────────────────────────────────
  const lesKeuze = !editing && (
    <section aria-label="Voor welke les" className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
      <Caption>Voor welke les</Caption>
      <Segmented value={lesson} onChange={setLesson} label="Les" options={(["deze", "volgende"] as Lesson[]).map((l) => {
        const p = lessonPeriod(weekday, l);
        return [l, `${l === "deze" ? "Deze les" : "Volgende les"}${studentId ? ` · ${kort(p.start)} – ${kort(p.due)}` : ""}`] as [Lesson, string];
      })} />
      {studentId && <Lesdag key={String(weekday)} studentId={studentId} name={student.name} weekday={weekday} onSaved={setWeekday} />}
      {existing
        ? <p className="text-sm m-0 rounded-xl bg-ok/10 px-3 py-2">Je hebt voor deze les al huiswerk gegeven. Wat je hier toevoegt, komt erbij; het doel, de vinkjes en de opnames blijven zoals ze zijn.</p>
        : lesson === "volgende" && <p className="text-sm text-muted m-0">{studentId ? student.name : "De leerling"} ziet dit huiswerk vanaf {studentId ? kort(period.start) : "de volgende lesdag"}.</p>}
    </section>
  );

  // Loopt nog: opdrachten van de lopende les meenemen naar de volgende (dezelfde opdracht, met zijn opnames)
  const looptNog = lopend && lopend.tasks.length > 0 && (
    <section aria-label="Loopt nog" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Caption>Loopt nog · gaat mee naar de volgende les?</Caption>
        <button type="button" onClick={() => setCarry(lopend.tasks.map((t) => t.id))} className="ml-auto text-sm font-semibold text-kent bg-transparent cursor-pointer p-0">alles mee</button>
      </div>
      {lopend.tasks.map((t) => {
        const on = carry.includes(t.id);
        const stand = [t.recordings.length ? `🎙️ ${t.recordings.length} ${t.recordings.length === 1 ? "opname" : "opnames"}` : "", t.doneAt ? "deze les afgevinkt ✓" : ""].filter(Boolean).join(" · ");
        return (
          <label key={t.id} className={clsx("flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer", on ? "border-ok bg-ok/10" : "border-line")}>
            <input type="checkbox" checked={on} onChange={() => setCarry((c) => (on ? c.filter((x) => x !== t.id) : [...c, t.id]))}
              className="w-5 h-5 accent-[var(--color-ok)]" aria-label={`${t.title} gaat mee`} />
            <span className="flex-1 min-w-0"><b>{t.title}</b>{on && <> <Week n={t.week + 1} prefix="wordt " /></>}
              {stand && <span className="block text-sm text-muted">{stand}</span>}</span>
          </label>
        );
      })}
    </section>
  );

  const wat = (
    <>
      {!editing && (templates.length > 0 || previous) && (
        <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
          <Caption>Snel beginnen</Caption>
          <div className="flex flex-wrap gap-1.5">
            {previous && (
              <button type="button" onClick={() => use(previous, previous.tasks.map((t) => draftFromTask(t, books)))}
                className="rounded-full border-2 border-kent bg-surface px-3 py-1.5 text-sm font-semibold text-kent cursor-pointer">↺ Vorig huiswerk als begin</button>
            )}
            {templates.map((t) => (
              <button key={t.id} type="button" onClick={() => use(t, t.tasks.map((x) => newDraft(x.kind, { ...x, id: undefined })))} title={`${t.minutesPerDay} min × ${t.daysPerWeek} dagen`}
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
        <Caption>{existing ? "Opdrachten erbij" : "Opdrachten"}</Caption>
        <OpdrachtenEditor tasks={tasks} onChange={setTasks} books={books} bank={bank} bankBeside />
        {editing && editing.tasks.some((t) => t.recordings.length > 0) && (
          <span className="text-xs text-muted">Haal je een stuk weg waar al opnames bij zijn, dan blijft het met de opnames staan.</span>
        )}
      </section>
    </>
  );

  const doel = existing ? (
    <section className="rounded-3xl bg-surface p-4 flex flex-col gap-1.5">
      <Caption>Doel</Caption>
      <span className="text-sm">{existing.minutesPerDay} min per dag, {existing.daysPerWeek} {existing.daysPerWeek === 1 ? "dag" : "dagen"} per week · tot {dueLabel(existing.dueDate)}</span>
      <span className="text-xs text-muted">Het doel van het lopende huiswerk blijft. Wil je het veranderen? Pas dat huiswerk aan op de pagina van {student.name}.</span>
    </section>
  ) : (
    <>
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
        <Caption>Oefendoel</Caption>
        <Stepper label="Minuten per dag" value={minutes} min={5} max={120} step={5} onChange={setMinutes} />
        <Stepper label="Dagen per week" value={days} min={1} max={7} step={1} onChange={setDays} />
        <span className="text-xs text-muted">Telt: notenspel, vrij oefenen en opnames (de gespeelde tijd)</span>
      </section>
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        {editing ? (
          <>
            <Datum id="start" label="Lesdatum" value={start} onChange={setStart} />
            <span className="text-xs text-muted">Het huiswerk loopt tot de dag vóór de volgende les{editing ? ` (nu tot ${dueLabel(editing.dueDate)})` : ""}.</span>
          </>
        ) : (
          <span className="text-sm">Loopt van <b>{studentId ? kort(period.start) : "de lesdag"}</b> tot en met <b>{studentId ? kort(period.due) : "de dag voor de volgende les"}</b></span>
        )}
      </section>
    </>
  );

  const versturen = (
    <>
      <section aria-label="Overzicht" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <Caption>Overzicht</Caption>
        {notes.length > 0 && <div className="flex flex-wrap gap-1.5">{notes.map((n) => <span key={n} className="rounded-xl px-2.5 py-1 font-bold bg-les text-fg text-sm">{labels[n]}</span>)}</div>}
        {meegaand.map((t) => <span key={t.id} className="text-sm">{t.kind === "stuk" ? "🎵" : "✓"} <b>{t.title}</b> <Week n={t.week + 1} /></span>)}
        {filled.map((t) => <span key={t.key} className="text-sm">{t.kind === "stuk" ? "🎵" : "✓"} <b>{t.title.trim()}</b>{t.recording ? " · 🎙️ opnemen" : ""}</span>)}
        {!existing && <span className="text-sm text-muted">{minutes} min per dag, {days} {days === 1 ? "dag" : "dagen"} per week{editing ? ` · tot ${dueLabel(editing.dueDate)}` : ` · ${lesson === "deze" ? "deze les" : "volgende les"}`}</span>}
        {notes.length === 0 && filled.length === 0 && <span className="text-sm text-muted">Nog geen noten of opdrachten.</span>}
      </section>
      {!existing && (
        <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
          <Caption>Opmerking</Caption>
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} aria-label="Opmerking" maxLength={1000}
            placeholder={`Iets voor ${studentId ? student.name : "de leerlingen"}, bijv. “Let op je ademhaling”`} className={clsx(field, "resize-y")} />
        </section>
      )}
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2.5">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={asTemplate} onChange={(e) => setAsTemplate(e.target.checked)} className="w-5 h-5 accent-[var(--color-ok)]" />
          Ook bewaren als sjabloon
        </label>
        {asTemplate && <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} maxLength={100} aria-label="Naam van het sjabloon"
          placeholder={`${tasks[0]?.title.trim() || "Huiswerk"}, ${minutes} min`} className={field} />}
      </section>
      {error && <p className="text-sm text-wrong m-0">{error}</p>}
      <Chip primary disabled={busy || (!!existing && filled.length === 0 && notes.length === 0 && meegaand.length === 0)} onClick={() => void save()} className="py-3 text-lg">
        {busy ? "Opslaan…" : editing ? "Wijzigingen opslaan" : existing ? "Toevoegen aan deze les" : `Opslaan en naar ${who} sturen`}
      </Chip>
      {editing && (sure
        ? <div className="flex gap-2 items-center"><span className="text-sm flex-1">Dit huiswerk stoppen? Opnames blijven bewaard.</span>
            <Chip onClick={() => void stop()} className="border-wrong text-wrong">Stoppen</Chip><Chip onClick={() => setSure(false)}>Toch niet</Chip></div>
        : <button type="button" onClick={() => setSure(true)} className="self-start text-sm text-muted bg-transparent cursor-pointer p-0">Huiswerk stoppen…</button>)}
    </>
  );

  const bibliotheek = (
    <aside aria-label="Uit de bibliotheek" className="hidden xl:flex rounded-3xl bg-surface p-4 flex-col gap-2.5 sticky top-4">
      <Caption>Uit de bibliotheek</Caption>
      <BankLijst bank={bank} books={books} added={tasks.map((t) => t.bankId).filter((x): x is string => !!x)}
        onAdd={(b) => setTasks((cur) => [...cur, draftFromBank(b)])} />
    </aside>
  );

  // laptop en iPad liggend: alles op één pagina, naast elkaar
  if (wide) {
    return (
      <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_340px_380px]">
        <div className="flex flex-col gap-4 min-w-0">{lesKeuze}{looptNog}{wat}</div>
        {bibliotheek}
        <div className="flex flex-col gap-4 min-w-0">{doel}{versturen}</div>
      </div>
    );
  }

  // smal: in drie stappen
  const naar = (n: Stap) => { setStap(n); window.scrollTo(0, 0); };
  return (
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
      {stap === 1 && <>{lesKeuze}{looptNog}{wat}<Chip primary onClick={() => naar(2)} className="py-3 text-lg">Volgende: doel</Chip></>}
      {stap === 2 && (
        <>{doel}
          <div className="flex gap-2">
            <Chip onClick={() => naar(1)} className="py-3">← Wat</Chip>
            <Chip primary onClick={() => naar(3)} className="flex-1 py-3 text-lg">Volgende: versturen</Chip>
          </div>
        </>
      )}
      {stap === 3 && <>{versturen}<Chip onClick={() => naar(2)} className="self-start">← Doel</Chip></>}
    </div>
  );
}

/** de vaste lesdag van de leerling; daaruit volgen de data van deze en de volgende les */
function Lesdag({ studentId, name, weekday, onSaved }: { studentId: string; name: string; weekday: number | null; onSaved(v: number | null): void }) {
  const [value, setValue] = useState(weekday);
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span>Lesdag van {name}:</span>
      <select value={value ?? ""} aria-label={`Lesdag van ${name}`} className={clsx(field, "w-auto py-1.5")}
        onChange={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); setValue(v); void client.homework.setSchedule(studentId, v).then(() => onSaved(v)).catch(() => setValue(weekday)); }}>
        <option value="">geen vaste lesdag</option>
        {WEEKDAGEN.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
    </label>
  );
}

const field = "w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]";

function Caption({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

function Datum({ id, label, value, min, onChange }: { id: string; label: string; value: string; min?: string; onChange(v: string): void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-sm">{label}</label>
      <input id={id} type="date" value={value} min={min} onChange={(e) => e.target.value && onChange(e.target.value)} className={clsx(field, "w-auto font-semibold")} />
    </div>
  );
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
