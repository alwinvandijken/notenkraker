/**
 * Opdrachten in het huiswerk (AC-118, mock-up docs/mockups/Huiswerk-Opdrachten.html stap 1 en 2):
 * de editor voor de leraar (stuk spelen met boek en verwijzing, of een opdracht om af te vinken; nieuw
 * of uit de eigen opdrachtenbank) en de weergave in de huiswerkkaart, met afvinken voor de leerling.
 */
import { useState } from "react";
import clsx from "clsx";
import { allCategories, taskReference, type BankTask, type Book, type HomeworkTask, type TaskInput, type TaskKind } from "@notenkraker/client";
import { client } from "@/lib/client";

export interface TaskDraft extends TaskInput {
  key: string;
  /** ook bewaren in de opdrachtenbank (alleen bij een nieuwe opdracht) */
  toBank: boolean;
  categories: string[];
}

let seq = 0;
export const newDraft = (kind: TaskKind = "stuk", from: Partial<TaskDraft> = {}): TaskDraft => ({
  key: `t${++seq}`, kind, title: "", bookId: null, page: "", chapter: "", number: "", track: "", bankId: null, toBank: false, categories: [], ...from,
});
export const draftFromBank = (b: BankTask): TaskDraft => newDraft(b.kind, { ...b, bankId: b.id, categories: b.categories });
/** gegeven opdracht terug naar een concept (bij "vorige huiswerk als begin"); het boek zoeken we op titel in de eigen lijst */
export const draftFromTask = (t: HomeworkTask, books: Book[]): TaskDraft =>
  newDraft(t.kind, { title: t.title, page: t.page, chapter: t.chapter, number: t.number, track: t.track, bookId: books.find((b) => b.title === t.bookTitle)?.id ?? null });
export const toInput = ({ kind, title, bookId, page, chapter, number, track, bankId }: TaskDraft): TaskInput =>
  ({ kind, title: title.trim(), bookId: bookId ?? null, page: page.trim(), chapter: chapter.trim(), number: number.trim(), track: track.trim(), bankId: bankId ?? null });

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

/** opdrachten in de huiswerkkaart; `canTick`: de leerling (of ouder) vinkt een opdracht af */
export function OpdrachtenLijst({ tasks, canTick }: { tasks: HomeworkTask[]; canTick?: boolean }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => Object.fromEntries(tasks.map((t) => [t.id, !!t.doneAt])));
  if (tasks.length === 0) return null;
  const tick = async (t: HomeworkTask) => {
    const next = !done[t.id];
    setDone((d) => ({ ...d, [t.id]: next }));
    try { await client.homework.setTaskDone(t.id, next); } catch { setDone((d) => ({ ...d, [t.id]: !next })); }
  };
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-start gap-2 text-sm">
          {t.kind === "opdracht" ? (
            <button type="button" disabled={!canTick} onClick={() => void tick(t)} aria-pressed={done[t.id]} aria-label={`${t.title} ${done[t.id] ? "gedaan" : "nog niet gedaan"}`}
              className={clsx("w-5 h-5 mt-0.5 rounded-md border-2 shrink-0 flex items-center justify-center text-xs text-white",
                done[t.id] ? "bg-ok border-ok" : "border-line bg-surface", canTick ? "cursor-pointer" : "cursor-default")}>{done[t.id] ? "✓" : ""}</button>
          ) : <span aria-hidden="true" className="w-5 text-center shrink-0">🎵</span>}
          <span className="min-w-0">
            <b className={clsx(t.kind === "opdracht" && done[t.id] && "line-through text-muted")}>{t.title}</b>
            {taskReference(t) && <span className="block text-xs text-muted">📖 {taskReference(t)}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
