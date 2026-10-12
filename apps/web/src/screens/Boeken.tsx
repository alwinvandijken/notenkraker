import { useEffect, useState } from "react";
import type { Book } from "@notenkraker/client";
import { client } from "@/lib/client";
import { Chip } from "@/components/ui";

/**
 * Mijn boeken (AC-118, mock-up docs/mockups/Huiswerk-Opdrachten.html stap 7): de boeken die de
 * leraar (of ouder) gebruikt, één keer ingevoerd. Bij huiswerk en in de opdrachtenbank kies je er
 * een uit de lijst. "Met audio-tracks" laat bij een stuk ook een tracknummer vragen.
 */
export function Boeken() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [hasAudio, setHasAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = () => void client.books.list().then(setBooks).catch(() => setBooks([]));
  useEffect(load, []);
  if (!books) return <p className="text-muted">Laden…</p>;

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try {
      await client.books.save({ title: title.trim(), author: author.trim(), hasAudio });
      setTitle(""); setAuthor(""); setHasAudio(false); load();
    } catch { setError("Opslaan lukte niet."); }
  };
  const remove = async (b: Book) => { setBooks((l) => l?.filter((x) => x.id !== b.id) ?? null); await client.books.remove(b.id); };
  const field = "w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]";

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <section className="rounded-3xl bg-surface p-2 flex flex-col">
        {books.length === 0 && <p className="m-0 p-3 text-muted">Nog geen boeken. Zet hieronder het boek dat je in de les gebruikt.</p>}
        {books.map((b) => (
          <div key={b.id} className="flex items-center gap-3 p-3 border-t border-line first:border-t-0">
            <span className="text-2xl" aria-hidden="true">📘</span>
            <span className="flex-1 min-w-0"><b className="block truncate">{b.title}</b>
              <span className="block text-xs text-muted">{[b.author, b.hasAudio && "met audio-tracks"].filter(Boolean).join(" · ") || " "}</span></span>
            <button type="button" onClick={() => void remove(b)} className="text-sm font-semibold text-wrong bg-transparent cursor-pointer">Weghalen</button>
          </div>
        ))}
      </section>
      <form onSubmit={add} className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
        <b className="font-display">Boek toevoegen</b>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titel, bijv. Saxofoon Methode 1" aria-label="Titel" required maxLength={200} className={field} />
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Uitgever of schrijver (mag)" aria-label="Uitgever of schrijver" maxLength={200} className={field} />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={hasAudio} onChange={(e) => setHasAudio(e.target.checked)} className="w-5 h-5 accent-[var(--color-ok)]" />
          Met audio-tracks (cd of download)
        </label>
        {error && <p className="text-sm text-wrong m-0">{error}</p>}
        <Chip type="submit" primary disabled={!title.trim()} className="self-start">Opslaan</Chip>
      </form>
    </div>
  );
}
