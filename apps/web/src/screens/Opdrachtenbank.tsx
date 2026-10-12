import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { allCategories, dateKey, taskReference, type BankTask, type Book } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip } from "@/components/ui";
import { newDraft, OpdrachtenEditor, toInput, type TaskDraft } from "@/components/Opdrachten";

/**
 * Opdrachtenbank (AC-118, mock-up docs/mockups/Huiswerk-Opdrachten.html stap 8–10): eigen
 * opdrachten, vooraf gemaakt en in categorieën. Zoeken, filteren op categorie of boek, aanvinken en
 * toewijzen aan leerlingen (ook later opnieuw). Toewijzen en een nieuwe opdracht zijn eigen pagina's.
 */
export function Opdrachtenbank({ onNew, onAssign }: { onNew(): void; onAssign(ids: string[]): void }) {
  const [bank, setBank] = useState<BankTask[] | null>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [bookId, setBookId] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    void client.bank.list().then(setBank).catch(() => setBank([]));
    void client.books.list().then(setBooks).catch(() => setBooks([]));
  }, []);
  const categories = useMemo(() => allCategories((bank ?? []).map((b) => b.categories)), [bank]);
  if (!bank) return <p className="text-muted">Laden…</p>;

  const shown = bank.filter((b) => (!cat || b.categories.includes(cat)) && (!bookId || b.bookId === bookId)
    && b.title.toLocaleLowerCase("nl").includes(q.trim().toLocaleLowerCase("nl")));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const remove = async (b: BankTask) => { setBank((l) => l?.filter((x) => x.id !== b.id) ?? null); await client.bank.remove(b.id); };
  const bookTitle = (id?: string | null) => books.find((x) => x.id === id)?.title ?? "";

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={!cat} onClick={() => setCat(null)} className="text-sm px-3 py-1.5">Alle · {bank.length}</Chip>
        {categories.map((c) => {
          const n = bank.filter((b) => b.categories.includes(c)).length;
          return <Chip key={c} active={cat === c} onClick={() => setCat(c)} className="text-sm px-3 py-1.5">{c} · {n}</Chip>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Zoek een opdracht" aria-label="Zoek een opdracht"
          className="flex-1 min-w-48 rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]" />
        <select value={bookId} onChange={(e) => setBookId(e.target.value)} aria-label="Boek" className="rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]">
          <option value="">Alle boeken</option>
          {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
        <Chip primary onClick={onNew}>+ Nieuwe opdracht</Chip>
      </div>
      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-fg text-bg px-4 py-2.5" role="region" aria-label="Gekozen opdrachten">
          <b>{picked.size} {picked.size === 1 ? "opdracht" : "opdrachten"} gekozen</b>
          <span className="flex-1" />
          <Chip primary onClick={() => onAssign([...picked])}>Toewijzen aan leerlingen</Chip>
          <button type="button" onClick={() => setPicked(new Set())} className="text-sm bg-transparent cursor-pointer text-bg/80">✕ wissen</button>
        </div>
      )}
      <section className="rounded-3xl bg-surface p-2 flex flex-col min-w-0">
        {shown.length === 0 && <p className="m-0 p-3 text-muted">{bank.length ? "Geen opdrachten gevonden." : "Nog geen opdrachten. Maak er een met “+ Nieuwe opdracht”, of vink bij huiswerk geven “Ook bewaren in de opdrachtenbank” aan."}</p>}
        {shown.map((b) => (
          <div key={b.id} className={clsx("flex items-center gap-3 p-3 border-t border-line first:border-t-0 rounded-xl min-w-0", picked.has(b.id) && "bg-kent-soft")}>
            <input type="checkbox" checked={picked.has(b.id)} onChange={() => toggle(b.id)} aria-label={`${b.title} kiezen`} className="w-5 h-5 accent-[var(--color-ok)] shrink-0" />
            <span aria-hidden="true">{b.kind === "stuk" ? "🎵" : "✓"}</span>
            <span className="flex-1 min-w-0"><b className="block truncate">{b.title}</b>
              <span className="block text-xs text-muted truncate">{[b.categories.join(", "), taskReference({ ...b, bookTitle: bookTitle(b.bookId) })].filter(Boolean).join(" · ") || (b.kind === "stuk" ? "stuk" : "opdracht")}</span></span>
            <button type="button" onClick={() => void remove(b)} className="text-sm font-semibold text-wrong bg-transparent cursor-pointer shrink-0">Weghalen</button>
          </div>
        ))}
      </section>
    </div>
  );
}

/** nieuwe opdracht in de bank: dezelfde editor als bij huiswerk geven, altijd met "bewaren in de bank" */
export function NieuweBankOpdracht({ onDone }: { onDone(): void }) {
  const [tasks, setTasks] = useState<TaskDraft[]>([newDraft("stuk", { toBank: true })]);
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void client.books.list().then(setBooks).catch(() => setBooks([])); }, []);
  const save = async () => {
    setError(null);
    try {
      for (const t of tasks.filter((x) => x.title.trim())) await client.bank.save({ ...toInput(t), categories: t.categories });
      onDone();
    } catch { setError("Opslaan lukte niet."); }
  };
  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <section className="rounded-3xl bg-surface p-4">
        <OpdrachtenEditor tasks={tasks.map((t) => ({ ...t, toBank: true }))} onChange={setTasks} books={books} bank={[]} />
      </section>
      {error && <p className="text-sm text-wrong m-0">{error}</p>}
      <Chip primary disabled={!tasks.some((t) => t.title.trim())} onClick={() => void save()} className="py-3 text-lg">Bewaren in de opdrachtenbank</Chip>
    </div>
  );
}

const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return dateKey(d); };

/** toewijzen: leerlingen kiezen en tot wanneer; de opdrachten komen bij hun lopende huiswerk van jou */
export function Toewijzen({ bankIds, onDone }: { bankIds: string[]; onDone(): void }) {
  const { students } = useApp();
  const [bank, setBank] = useState<BankTask[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState(inDays(7));
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  useEffect(() => { void client.bank.list().then(setBank).catch(() => setBank([])); }, []);
  const chosen = bank.filter((b) => bankIds.includes(b.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const assign = async () => {
    setState({ busy: true });
    try { await client.bank.assign([...picked], bankIds, due); onDone(); }
    catch { setState({ error: "Toewijzen lukte niet." }); }
  };
  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <section className="rounded-3xl bg-surface p-4 text-sm">{chosen.map((b) => `${b.kind === "stuk" ? "🎵" : "✓"} ${b.title}`).join(" · ") || "…"}</section>
      <section className="rounded-3xl bg-surface p-2 flex flex-col">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted px-3 pt-2">Aan wie</span>
        {students.map((s) => (
          <label key={s.id} className="flex items-center gap-3 p-3 border-t border-line first-of-type:border-t-0 cursor-pointer">
            <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="w-5 h-5 accent-[var(--color-ok)]" />
            <span className="font-semibold">{s.name}</span>
          </label>
        ))}
      </section>
      <section className="rounded-3xl bg-surface p-4 flex items-center justify-between gap-3">
        <label htmlFor="assignDue" className="text-sm">Tot (als er nog geen huiswerk van jou loopt)</label>
        <input id="assignDue" type="date" value={due} min={inDays(0)} onChange={(e) => e.target.value && setDue(e.target.value)}
          className="rounded-xl border-2 border-line bg-surface px-3 py-2 font-semibold" />
      </section>
      <p className="text-xs text-muted m-0">De opdrachten komen bij het huiswerk dat je deze leerling al gaf. Is dat er niet, dan krijgt de leerling nieuw huiswerk (15 min per dag, 5 dagen).</p>
      {state.error && <p className="text-sm text-wrong m-0">{state.error}</p>}
      <Chip primary disabled={picked.size === 0 || state.busy} onClick={() => void assign()} className="py-3 text-lg">
        {state.busy ? "Toewijzen…" : `Toewijzen aan ${picked.size} ${picked.size === 1 ? "leerling" : "leerlingen"}`}
      </Chip>
    </div>
  );
}
