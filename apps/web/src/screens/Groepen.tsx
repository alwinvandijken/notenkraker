import { useEffect, useState } from "react";
import clsx from "clsx";
import { dateKey, lessonOverview, nextLesson, type Holiday, type LessonGroup, type Schedule } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip, Segmented } from "@/components/ui";

/**
 * Lesgroepen (AC-124 stap 2, mock-up docs/mockups/Lesgroepen-beheren.html): de lijst bij Leerlingen | Groepen,
 * een nieuwe groep maken en de vakanties van de leraar. Een privéles staat in de lijst met de naam van de leerling.
 */
export const DAGEN: Array<[string, string]> = [["1", "ma"], ["2", "di"], ["3", "wo"], ["4", "do"], ["5", "vr"], ["6", "za"], ["0", "zo"]];
const DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
export const kort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
export const roosterTekst = (s: Schedule) => (s.weekday === null ? "geen rooster" : `${DAG[s.weekday]}${s.startTime ? ` ${s.startTime}` : ""}`);

export function GroepenLijst({ onOpen, onNew, onHolidays }: { onOpen(id: string): void; onNew(): void; onHolidays(): void }) {
  const [groups, setGroups] = useState<LessonGroup[] | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  useEffect(() => {
    void Promise.all([client.groups.mine(), client.groups.holidays()]).then(([g, h]) => { setGroups(g); setHolidays(h); }).catch(() => setGroups([]));
  }, []);
  if (!groups) return <p className="text-muted">Laden…</p>;
  const today = dateKey(new Date());
  const rows = groups.map((g) => {
    const overview = lessonOverview(g.lessons, g.schedule, holidays, today);
    return { g, next: nextLesson(overview, today), last: overview.find((r) => r.date <= today && r.lesson) };
  }).sort((a, b) => (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999"));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip primary onClick={onNew}>+ Nieuwe groep</Chip>
        <Chip onClick={onHolidays}>Vakanties</Chip>
      </div>
      {rows.length === 0 && <p className="text-muted m-0">Nog geen groepen. Een privéles verschijnt hier zodra je huiswerk geeft.</p>}
      {rows.map(({ g, next, last }) => {
        const leden = g.members.filter((m) => !m.leftOn);
        return (
          <button key={g.id} type="button" onClick={() => onOpen(g.id)}
            className="rounded-3xl bg-surface p-4 flex items-center gap-3 text-left cursor-pointer">
            <span className="flex-1 min-w-0">
              <b className="font-display block">{g.displayName}{!g.name && <span className="font-normal text-muted"> · privéles</span>}</b>
              <span className="text-sm text-muted">{roosterTekst(g.schedule)}{g.name ? ` · ${leden.length} ${leden.length === 1 ? "leerling" : "leerlingen"}` : ""}</span>
            </span>
            <span className="text-right text-sm">
              {last && <span className="block text-muted">{last.status === "afgezegd" ? "afgezegd" : "laatste"}: {kort(last.date)}</span>}
              <span className="block">{next ? `volgende: ${kort(next.date)}` : "geen les gepland"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NieuweGroep({ onDone }: { onDone(id: string): void }) {
  const { students } = useApp();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [weekday, setWeekday] = useState<string>("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      onDone(await client.groups.create(name.trim(), chosen, { weekday: weekday === "" ? null : Number(weekday), startTime: time || null }));
    } catch { setError("Opslaan lukte niet. Probeer het nog een keer."); setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <label className="flex flex-col gap-1"><span className="text-sm text-muted">Naam</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" placeholder="Samenspel zaterdag" /></label>
      </section>
      <section aria-label="Leerlingen" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Leerlingen</span>
        {students.map((s) => (
          <label key={s.id} className={clsx("flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer", chosen.includes(s.id) ? "border-ok bg-ok/10" : "border-line")}>
            <input type="checkbox" aria-label={s.name} checked={chosen.includes(s.id)} className="w-5 h-5 accent-[var(--color-ok)]"
              onChange={() => setChosen((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c, s.id]))} />
            <span>{s.name}</span>
          </label>
        ))}
      </section>
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Rooster</span>
        <Segmented value={weekday} onChange={setWeekday} label="Lesdag" options={DAGEN} />
        <label className="flex items-center gap-2"><span className="text-sm text-muted">Begintijd</span>
          <input type="time" aria-label="Begintijd" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5 ml-auto" /></label>
        <span className="text-xs text-muted">Leeg laten mag: dan kies je per les een datum.</span>
      </section>
      {error && <p className="text-sm text-accent m-0">{error}</p>}
      <Chip primary disabled={busy || !name.trim() || chosen.length === 0} onClick={() => void save()}>Groep maken</Chip>
    </div>
  );
}

export function Vakanties() {
  const [list, setList] = useState<Holiday[] | null>(null);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => void client.groups.holidays().then(setList).catch(() => setList([]));
  useEffect(load, []);
  const add = async () => {
    setError(null);
    try { await client.groups.addHoliday(name.trim(), from, to); setName(""); setFrom(""); setTo(""); load(); }
    catch { setError("Dat lukte niet. Klopt de periode (hooguit 4 maanden)?"); }
  };
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <p className="text-muted m-0">Geen lessen in deze periodes, voor al je groepen. "Volgende les" springt eroverheen.</p>
      <section aria-label="Vakanties" className="rounded-3xl bg-surface p-4 flex flex-col gap-1">
        {list?.length === 0 && <span className="text-muted">Nog geen vakanties.</span>}
        {list?.map((h) => (
          <div key={h.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span className="flex-1"><b>{h.name || "Vakantie"}</b><span className="block text-sm text-muted">{kort(h.startDate)} – {kort(h.endDate)}</span></span>
            <button type="button" aria-label={`${h.name || "Vakantie"} verwijderen`} onClick={() => void client.groups.removeHoliday(h.id).then(load)}
              className="bg-transparent cursor-pointer text-muted px-2">✕</button>
          </div>
        ))}
      </section>
      <section aria-label="Nieuwe vakantie" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <input aria-label="Naam van de vakantie" value={name} onChange={(e) => setName(e.target.value)} placeholder="Herfstvakantie" className="rounded-xl border-2 border-line px-3 py-2" />
        <div className="flex gap-2">
          <label className="flex-1 flex flex-col gap-1"><span className="text-sm text-muted">Van</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" /></label>
          <label className="flex-1 flex flex-col gap-1"><span className="text-sm text-muted">Tot en met</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" /></label>
        </div>
        {error && <p className="text-sm text-accent m-0">{error}</p>}
        <Chip primary disabled={!from || !to} onClick={() => void add()}>Toevoegen</Chip>
      </section>
    </div>
  );
}
