/**
 * Opdrachten in het huiswerk (AC-118, mock-up docs/mockups/Huiswerk-Opdrachten.html stap 1 en 2):
 * de editor voor de leraar (stuk spelen met boek en verwijzing, of een opdracht om af te vinken; nieuw
 * of uit de eigen opdrachtenbank) en de weergave in de huiswerkkaart, met afvinken voor de leerling.
 * Stap 1b: eigen bladmuziek (pdf of foto) en een voorbeeldopname uploaden, en vragen om een opname;
 * in de kaart: bladmuziek openen, voorbeeld en opname beluisteren, opnemen en reageren.
 */
import { useState } from "react";
import clsx from "clsx";
import { allCategories, recordingKeptUntil, taskReference, whenLabel, type BankTask, type Book, type HomeworkTask, type TaskInput, type TaskKind } from "@notenkraker/client";
import { client } from "@/lib/client";

export interface TaskDraft extends TaskInput {
  key: string;
  /** ook bewaren in de opdrachtenbank (alleen bij een nieuwe opdracht) */
  toBank: boolean;
  categories: string[];
}

let seq = 0;
export const newDraft = (kind: TaskKind = "stuk", from: Partial<TaskDraft> = {}): TaskDraft => ({
  key: `t${++seq}`, kind, title: "", bookId: null, page: "", chapter: "", number: "", track: "", bankId: null, toBank: false, categories: [],
  sheetPath: null, sheetName: "", examplePath: null, recording: false, ...from,
});
export const draftFromBank = (b: BankTask): TaskDraft => newDraft(b.kind, { ...b, bankId: b.id, categories: b.categories });
/** gegeven opdracht terug naar een concept (bij "vorige huiswerk als begin"); het boek zoeken we op titel in de eigen lijst */
export const draftFromTask = (t: HomeworkTask, books: Book[]): TaskDraft =>
  newDraft(t.kind, { title: t.title, page: t.page, chapter: t.chapter, number: t.number, track: t.track, bookId: books.find((b) => b.title === t.bookTitle)?.id ?? null,
    sheetPath: t.sheetPath, sheetName: t.sheetName, examplePath: t.examplePath, recording: t.recording });
export const toInput = ({ kind, title, bookId, page, chapter, number, track, bankId, sheetPath, sheetName, examplePath, recording }: TaskDraft): TaskInput => ({
  kind, title: title.trim(), bookId: bookId ?? null, page: page.trim(), chapter: chapter.trim(), number: number.trim(), track: track.trim(), bankId: bankId ?? null,
  sheetPath: kind === "stuk" ? sheetPath ?? null : null, sheetName: kind === "stuk" ? sheetName ?? "" : "",
  examplePath: kind === "stuk" ? examplePath ?? null : null, recording: kind === "stuk" && !!recording,
});

const field = "w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]";

export function OpdrachtenEditor({ tasks, onChange, books, bank }: { tasks: TaskDraft[]; onChange(t: TaskDraft[]): void; books: Book[]; bank: BankTask[] }) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const set = (key: string, patch: Partial<TaskDraft>) => onChange(tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const categories = allCategories(bank.map((b) => b.categories));
  const found = bank.filter((b) => `${b.title} ${b.categories.join(" ")}`.toLocaleLowerCase("nl").includes(q.trim().toLocaleLowerCase("nl")));

  return (
    <div className="flex flex-col gap-3">
      {tasks.length === 0 && <p className="text-sm text-muted m-0">Nog geen opdrachten. Een stuk om te spelen, of iets om af te vinken.</p>}
      {tasks.map((t) => {
        const book = books.find((b) => b.id === t.bookId);
        return (
          <div key={t.key} className="rounded-2xl border-2 border-line p-3 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full bg-bg p-0.5" role="group" aria-label="Soort opdracht">
                {([["stuk", "🎵 Stuk"], ["opdracht", "✓ Opdracht"]] as Array<[TaskKind, string]>).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={t.kind === k} onClick={() => set(t.key, { kind: k })}
                    className={clsx("rounded-full px-3 py-1 text-sm cursor-pointer", t.kind === k ? "bg-fg text-bg font-semibold" : "bg-transparent text-muted")}>{label}</button>
                ))}
              </span>
              <span className="flex-1" />
              {t.bankId && <span className="text-xs text-muted">uit de bank</span>}
              <button type="button" onClick={() => onChange(tasks.filter((x) => x.key !== t.key))} aria-label="Opdracht weghalen" className="text-muted bg-transparent cursor-pointer text-lg px-1">✕</button>
            </div>
            <input value={t.title} onChange={(e) => set(t.key, { title: e.target.value })} maxLength={300} aria-label="Titel van de opdracht" className={field}
              placeholder={t.kind === "stuk" ? "Bijv. Lang zal ze leven" : "Bijv. Zeg het notenalfabet achteruit"} />
            {t.kind === "stuk" && (
              <>
                <select value={t.bookId ?? ""} onChange={(e) => set(t.key, { bookId: e.target.value || null })} aria-label="Boek" className={field}>
                  <option value="">Geen boek</option>
                  {books.map((b) => <option key={b.id} value={b.id}>📖 {b.title}</option>)}
                </select>
                {books.length === 0 && <span className="text-xs text-muted">Zet je boeken eerst in “Mijn boeken” (menu), dan kies je ze hier.</span>}
                <Upload label="📄 Eigen bladmuziek (pdf of foto)" accept="application/pdf,image/*" name={t.sheetName || (t.sheetPath ? "bladmuziek" : "")}
                  onUploaded={(path, name) => set(t.key, { sheetPath: path, sheetName: name })} onClear={() => set(t.key, { sheetPath: null, sheetName: "" })} />
                <Upload label="🎧 Voorbeeldopname (mag)" accept="audio/*" name={t.examplePath ? "voorbeeldopname" : ""}
                  onUploaded={(path) => set(t.key, { examplePath: path })} onClear={() => set(t.key, { examplePath: null })} />
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!t.recording} onChange={(e) => set(t.key, { recording: e.target.checked })} className="w-5 h-5 accent-[var(--color-ok)]" />
                  🎙️ De leerling neemt het op en stuurt het in
                </label>
                {t.bookId && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {([["page", "Bladzijde"], ["chapter", "Hoofdstuk"], ["number", "Nummer"], ...(book?.hasAudio ? [["track", "Track"]] : [])] as Array<[keyof TaskDraft, string]>).map(([k, label]) => (
                      <label key={k} className="flex flex-col gap-1 text-xs text-muted">{label}
                        <input value={t[k] as string} onChange={(e) => set(t.key, { [k]: e.target.value })} maxLength={20} className={clsx(field, "py-1.5")} />
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
            {!t.bankId && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={t.toBank} onChange={(e) => set(t.key, { toBank: e.target.checked })} className="w-5 h-5 accent-[var(--color-ok)]" />
                Ook bewaren in de opdrachtenbank
              </label>
            )}
            {!t.bankId && t.toBank && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categorie">
                {categories.map((c) => (
                  <button key={c} type="button" aria-pressed={t.categories.includes(c)}
                    onClick={() => set(t.key, { categories: t.categories.includes(c) ? t.categories.filter((x) => x !== c) : [...t.categories, c] })}
                    className={clsx("rounded-full border-2 px-3 py-1 text-sm cursor-pointer", t.categories.includes(c) ? "border-les bg-les font-semibold" : "border-line bg-surface")}>{c}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange([...tasks, newDraft()])}
          className="flex-1 rounded-xl border-2 border-dashed border-line text-muted bg-surface px-3 py-2 font-semibold cursor-pointer">+ Nieuwe opdracht</button>
        <button type="button" onClick={() => setPicking(!picking)} aria-expanded={picking}
          className="flex-1 rounded-xl border-2 border-kent text-kent bg-surface px-3 py-2 font-semibold cursor-pointer">📚 Uit de opdrachtenbank</button>
      </div>
      {picking && (
        <div className="rounded-2xl bg-bg p-3 flex flex-col gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Zoek in je opdrachtenbank" aria-label="Zoek in je opdrachtenbank" className={field} />
          {bank.length === 0 && <span className="text-sm text-muted">Je opdrachtenbank is nog leeg. Vink bij een nieuwe opdracht “Ook bewaren in de opdrachtenbank” aan.</span>}
          {found.slice(0, 20).map((b) => (
            <button key={b.id} type="button" onClick={() => onChange([...tasks, draftFromBank(b)])}
              className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-left cursor-pointer border-2 border-transparent hover:border-kent">
              <span aria-hidden="true">{b.kind === "stuk" ? "🎵" : "✓"}</span>
              <span className="flex-1 min-w-0"><b className="block truncate">{b.title}</b>
                <span className="block text-xs text-muted truncate">{[b.categories.join(", "), taskReference({ ...b, bookTitle: books.find((x) => x.id === b.bookId)?.title ?? "" })].filter(Boolean).join(" · ")}</span></span>
              <span className="text-kent font-semibold text-sm">+ toevoegen</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** bestand kiezen en meteen uploaden naar de eigen map in "bladmuziek" (hooguit 10 MB) */
function Upload({ label, accept, name, onUploaded, onClear }: { label: string; accept: string; name: string; onUploaded(path: string, name: string): void; onClear(): void }) {
  const [state, setState] = useState<"" | "bezig" | "fout" | "te groot">("");
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setState("te groot"); return; }
    setState("bezig");
    try { onUploaded(await client.files.uploadSheet(file, file.name), file.name); setState(""); } catch { setState("fout"); }
  };
  if (name) {
    return (
      <div className="flex items-center gap-2 rounded-xl border-2 border-line px-3 py-2 text-sm">
        <span className="flex-1 min-w-0 truncate">{label.split(" ")[0]} <b>{name}</b></span>
        <button type="button" onClick={onClear} className="text-xs text-muted bg-transparent cursor-pointer">weghalen</button>
      </div>
    );
  }
  return (
    <label className="flex items-center gap-2 rounded-xl border-2 border-dashed border-line px-3 py-2 text-sm text-muted cursor-pointer">
      <span className="flex-1">{state === "bezig" ? "Uploaden…" : label}</span>
      {state === "fout" && <span className="text-wrong text-xs">uploaden lukte niet</span>}
      {state === "te groot" && <span className="text-wrong text-xs">hooguit 10 MB</span>}
      <input type="file" accept={accept} className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
    </label>
  );
}

/** speler die de tijdelijke link pas ophaalt als je erop tikt */
function Play({ bucket, path, label }: { bucket: "bladmuziek" | "opnames"; path: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  if (src) return <audio controls autoPlay src={src} className="w-full h-10" />;
  return (
    <button type="button" onClick={() => void client.files.url(bucket, path).then(setSrc).catch(() => setError(true))}
      className="self-start rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-semibold cursor-pointer">
      ▶ {label}{error ? " (lukt niet)" : ""}
    </button>
  );
}

const REACTIONS = ["👍", "⭐", "🎉", "💪"];

/**
 * opdrachten in de huiswerkkaart. `viewer`: "pupil" vinkt af en neemt op, "giver" (wie het huiswerk
 * gaf) luistert en reageert, "other" (ouder, andere leraar) luistert mee.
 */
export function OpdrachtenLijst({ tasks, viewer = "other", mayRecord, onRecord, dueDate }: {
  tasks: HomeworkTask[]; viewer?: "pupil" | "giver" | "other"; mayRecord?: boolean; onRecord?(task: HomeworkTask): void; dueDate: string;
}) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(tasks.map((t) => [t.id, !!t.doneAt])));
  if (tasks.length === 0) return null;
  const tick = async (t: HomeworkTask) => {
    const next = !done[t.id];
    setDone((d) => ({ ...d, [t.id]: next }));
    try { await client.homework.setTaskDone(t.id, next); } catch { setDone((d) => ({ ...d, [t.id]: !next })); }
  };
  const openSheet = (t: HomeworkTask) => {
    // eerst een leeg venster openen (anders blokkeert Safari het), dan de tijdelijke link erin zetten
    const w = window.open("", "_blank");
    void client.files.url("bladmuziek", t.sheetPath!).then((url) => { if (w) w.location.href = url; else window.location.href = url; }).catch(() => w?.close());
  };
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2 text-sm">
          {t.kind === "opdracht" ? (
            <button type="button" disabled={viewer !== "pupil"} onClick={() => void tick(t)} aria-pressed={done[t.id]} aria-label={`${t.title} ${done[t.id] ? "gedaan" : "nog niet gedaan"}`}
              className={clsx("w-5 h-5 mt-0.5 rounded-md border-2 shrink-0 flex items-center justify-center text-xs text-white",
                done[t.id] ? "bg-ok border-ok" : "border-line bg-surface", viewer === "pupil" ? "cursor-pointer" : "cursor-default")}>{done[t.id] ? "✓" : ""}</button>
          ) : <span aria-hidden="true" className="w-5 text-center shrink-0">🎵</span>}
          <span className="min-w-0 flex-1 flex flex-col gap-1.5">
            <span>
              <b className={clsx(t.kind === "opdracht" && done[t.id] && "line-through text-muted")}>{t.title}</b>
              {taskReference(t) && <span className="block text-xs text-muted">📖 {taskReference(t)}</span>}
            </span>
            {(t.sheetPath || t.examplePath) && (
              <span className="flex flex-wrap gap-2">
                {t.sheetPath && <button type="button" onClick={() => openSheet(t)} className="rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-semibold cursor-pointer">📄 Bladmuziek</button>}
                {t.examplePath && <Play bucket="bladmuziek" path={t.examplePath} label="Voorbeeld" />}
              </span>
            )}
            {t.recording && <Opname task={t} viewer={viewer} mayRecord={mayRecord} onRecord={onRecord} dueDate={dueDate} />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Opname({ task: t, viewer, mayRecord, onRecord, dueDate }: {
  task: HomeworkTask; viewer: "pupil" | "giver" | "other"; mayRecord?: boolean; onRecord?(task: HomeworkTask): void; dueDate: string;
}) {
  const [emoji, setEmoji] = useState(t.reactionEmoji);
  const [text, setText] = useState(t.reaction);
  const [saved, setSaved] = useState(!!t.reactedAt);
  const kept = recordingKeptUntil(dueDate).split("-").reverse().join("-");
  const react = async (e: string, msg: string) => {
    setEmoji(e); setSaved(false);
    try { await client.homework.react(t.id, e, msg); setSaved(true); } catch { /* blijft "niet opgeslagen" */ }
  };
  return (
    <span className="flex flex-col gap-1.5 rounded-xl bg-bg p-2.5">
      {t.recordingPath ? (
        <>
          <Play bucket="opnames" path={t.recordingPath} label="Opname beluisteren" />
          <span className="text-xs text-muted">ingestuurd {t.submittedAt ? whenLabel(t.submittedAt) : ""} · wordt verwijderd op {kept}</span>
        </>
      ) : t.recordingDeletedAt ? (
        <span className="text-xs text-muted">De opname is verwijderd (de bewaartermijn is voorbij).</span>
      ) : <span className="text-xs text-muted">🎙️ Nog geen opname ingestuurd.</span>}

      {viewer !== "giver" && (emoji || text) && (
        <span className="text-sm rounded-lg bg-surface px-2.5 py-1.5">{emoji} {text && <span className="whitespace-pre-line">“{text}”</span>}</span>
      )}

      {viewer === "pupil" && (mayRecord
        ? <button type="button" onClick={() => onRecord?.(t)} className="self-start rounded-full bg-accent text-white px-4 py-1.5 font-semibold cursor-pointer">
            🎙️ {t.recordingPath ? "Opnieuw opnemen" : "Opnemen en insturen"}</button>
        : <span className="text-xs text-muted">Vraag je ouder om opnames toe te staan (op jouw pagina bij je ouder).</span>)}

      {viewer === "giver" && t.recordingPath && (
        <span className="flex flex-col gap-1.5">
          <span className="flex flex-wrap gap-1.5" role="group" aria-label="Reactie">
            {REACTIONS.map((e) => (
              <button key={e} type="button" aria-pressed={emoji === e} onClick={() => void react(emoji === e ? "" : e, text)}
                className={clsx("rounded-full border-2 px-2.5 py-0.5 cursor-pointer", emoji === e ? "border-les bg-les" : "border-line bg-surface")}>{e}</button>
            ))}
          </span>
          <span className="flex gap-1.5">
            <input value={text} onChange={(e) => { setText(e.target.value); setSaved(false); }} maxLength={1000} placeholder="Schrijf een reactie…" aria-label="Reactie"
              className="flex-1 min-w-0 rounded-xl border-2 border-line bg-surface px-2.5 py-1.5 text-sm" />
            <button type="button" onClick={() => void react(emoji, text.trim())} className="rounded-full border-2 border-line bg-surface px-3 text-sm font-semibold cursor-pointer">
              {saved ? "✓" : "Opslaan"}</button>
          </span>
        </span>
      )}
    </span>
  );
}
