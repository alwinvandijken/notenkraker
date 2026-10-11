import { useEffect, useState } from "react";
import { whenLabel, type AdminUser, type Feedback, type FeedbackStatus, type Role } from "@notenkraker/client";
import { client } from "@/lib/client";
import { linearNewUrl } from "@/lib/feedback";
import { useApp } from "@/lib/store";
import { Chip, Segmented } from "@/components/ui";

/**
 * Beheer (AC-116, mock-up docs/mockups/Feedback.html stap 4 en 5), alleen voor een admin: de
 * feedback met filters op status, en per account de rol en of die feedback mag geven. Een feedbackbericht opent op een eigen
 * pagina (FeedbackDetail). "Naar Linear" opent een nieuw Linear-issue met de tekst al ingevuld.
 */
export type BeheerTab = "feedback" | "mensen";
const STATUS: Array<[FeedbackStatus, string]> = [["nieuw", "Nieuw"], ["bekeken", "Bekeken"], ["linear", "In Linear"], ["klaar", "Afgehandeld"]];
const KIND = { idee: "💡 Idee", fout: "🐞 Werkt niet", vraag: "❓ Vraag" } as const;

export function Beheer({ tab, onTab, onOpen }: { tab: BeheerTab; onTab(t: BeheerTab): void; onOpen(id: string): void }) {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <Segmented value={tab} onChange={onTab} label="Beheer" options={[["feedback", "💬 Feedback"], ["mensen", "👥 Accounts"]]} />
      {tab === "feedback" ? <FeedbackLijst onOpen={onOpen} /> : <Mensen />}
    </div>
  );
}

function useFeedback(): [Feedback[] | null, () => void] {
  const [items, setItems] = useState<Feedback[] | null>(null);
  const load = () => void client.feedback.list().then(setItems).catch(() => setItems([]));
  useEffect(load, []);
  return [items, load];
}

function FeedbackLijst({ onOpen }: { onOpen(id: string): void }) {
  const [items] = useFeedback();
  const [status, setStatus] = useState<FeedbackStatus>("nieuw");
  if (!items) return <p className="text-muted">Laden…</p>;
  const shown = items.filter((f) => f.status === status);
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {STATUS.map(([s, label]) => (
          <Chip key={s} active={s === status} onClick={() => setStatus(s)} className="text-sm px-3 py-1.5">{label} · {items.filter((f) => f.status === s).length}</Chip>
        ))}
      </div>
      <section className="rounded-3xl bg-surface p-2 flex flex-col min-w-0">
        {shown.length === 0 && <p className="text-sm text-muted m-0 p-3">Niets {status === "nieuw" ? "nieuws" : "hier"}.</p>}
        {shown.map((f) => (
          <button key={f.id} type="button" onClick={() => onOpen(f.id)}
            className="w-full flex items-start gap-3 p-3 border-t border-line first:border-t-0 text-left bg-transparent cursor-pointer hover:bg-bg rounded-xl min-w-0">
            <span className="text-sm shrink-0 w-24">{KIND[f.kind]}</span>
            <span className="flex-1 min-w-0">
              <span className="block truncate">{f.message}</span>
              <span className="block text-xs text-muted truncate">{f.displayName || "onbekend"}{f.role ? ` · ${f.role}` : ""} · {f.screen || "?"} · {whenLabel(f.createdAt)}</span>
            </span>
            <span className="text-2xl text-muted leading-none" aria-hidden="true">›</span>
          </button>
        ))}
      </section>
    </>
  );
}

export function FeedbackDetail({ id }: { id: string }) {
  const [items, reload] = useFeedback();
  const f = items?.find((x) => x.id === id);
  // eerste keer openen = bekeken
  const first = f?.status === "nieuw" ? f.id : null;
  useEffect(() => { if (first) void client.feedback.setStatus(first, "bekeken").then(reload); }, [first]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items) return <p className="text-muted">Laden…</p>;
  if (!f) return <p className="text-muted">Deze feedback bestaat niet meer.</p>;
  const set = (status: FeedbackStatus, linearUrl?: string | null) => void client.feedback.setStatus(f.id, status, linearUrl).then(reload);
  const toLinear = () => { window.open(linearNewUrl(f), "_blank", "noopener"); set("linear"); };

  return (
    <div className="flex flex-col gap-4 max-w-[760px]">
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
        <div className="flex justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <span>{KIND[f.kind]} · {STATUS.find(([s]) => s === f.status)?.[1]}</span><span>{whenLabel(f.createdAt)}</span>
        </div>
        <p className="m-0 whitespace-pre-wrap">{f.message}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-muted m-0">
          <dt>Van</dt><dd className="m-0">{f.displayName || "onbekend"}{f.role ? ` (${f.role})` : ""}</dd>
          <dt>Pagina</dt><dd className="m-0">{f.screen || "?"} <span className="text-xs">({f.url})</span></dd>
          <dt>Apparaat</dt><dd className="m-0">{f.device}</dd>
          <dt>Versie</dt><dd className="m-0">{f.version}</dd>
          {f.linearUrl && <><dt>Linear</dt><dd className="m-0"><a href={f.linearUrl} target="_blank" rel="noreferrer" className="text-kent">{f.linearUrl}</a></dd></>}
        </dl>
      </section>
      <div className="flex flex-wrap gap-2">
        <Chip primary onClick={toLinear}>Naar Linear ↗</Chip>
        <Chip active={f.status === "klaar"} onClick={() => set("klaar")}>Afgehandeld</Chip>
        <Chip active={f.status === "bekeken"} onClick={() => set("bekeken")}>Bekeken</Chip>
      </div>
    </div>
  );
}

const ROLES: Array<[Exclude<Role, "admin">, string]> = [["leerling", "Leerling"], ["ouder", "Ouder"], ["leraar", "Leraar"]];

function Mensen() {
  const { profile } = useApp();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { void client.admin.users().then(setUsers).catch(() => setUsers([])); }, []);
  if (!users) return <p className="text-muted">Laden…</p>;
  const toggle = async (u: AdminUser) => {
    setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, canGiveFeedback: !u.canGiveFeedback } : x)) ?? null);
    await client.admin.setFeedbackAllowed(u.id, !u.canGiveFeedback);
  };
  const changeRole = async (u: AdminUser, role: Exclude<Role, "admin">) => {
    setError(null);
    setUsers((list) => list?.map((x) => (x.id === u.id ? { ...x, role } : x)) ?? null);
    try { await client.admin.setRole(u.id, role); }
    catch { setError(`De rol van ${u.displayName || u.email} wijzigen lukte niet.`); setUsers((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? null); }
  };
  const shown = users.filter((u) => `${u.displayName} ${u.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Zoek op naam of e-mail" aria-label="Zoek op naam of e-mail"
        className="w-full max-w-sm rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]" />
      {error && <p className="text-sm text-wrong m-0">{error}</p>}
      <section className="rounded-3xl bg-surface p-2 flex flex-col min-w-0">
        {shown.map((u) => {
          const who = u.displayName || u.email;
          return (
            <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 border-t border-line first:border-t-0 min-w-0">
              <span className="flex-1 min-w-40">
                <b className="block truncate">{who}</b>
                <span className="block text-xs text-muted truncate">{u.email}</span>
              </span>
              {u.role === "admin" || u.id === profile?.id ? (
                <span className="text-sm text-muted px-2">{u.role === "admin" ? "Beheerder" : u.role}</span>
              ) : (
                <select value={u.role ?? ""} onChange={(e) => void changeRole(u, e.target.value as Exclude<Role, "admin">)} aria-label={`Rol van ${who}`}
                  className="rounded-xl border-2 border-line bg-surface px-2 py-1.5 text-sm font-semibold">
                  {!u.role && <option value="" disabled>nog geen rol</option>}
                  {ROLES.map(([r, label]) => <option key={r} value={r}>{label}</option>)}
                </select>
              )}
              <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                <input type="checkbox" checked={u.canGiveFeedback} onChange={() => void toggle(u)} aria-label={`${who} mag feedback geven`}
                  className="w-6 h-6 accent-[var(--color-ok)] cursor-pointer shrink-0" />
                feedback
              </label>
            </div>
          );
        })}
      </section>
      <p className="text-xs text-muted m-0">Een nieuwe rol geldt na opnieuw inloggen. Beheerder maken kan alleen in Supabase.</p>
    </>
  );
}
