/**
 * Leerlingentabel voor de leraar op een breed scherm (AC-117, mock-up docs/mockups/Leraar-Desktop.html
 * stap 1): alle leerlingen in één tabel, sorteren op elke kolom, zoeken en filteren op hoe het
 * huiswerk gaat. Vink leerlingen aan om ze samen huiswerk te geven of hun vorige huiswerk te herhalen.
 */
import { useMemo, useState } from "react";
import { dateKey, dueLabel, STATUS_LABEL, worstStatus } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { filterRows, sortRows, type SortKey, type StatusFilter, type TableRow } from "@/lib/leerlingen";
import { GiverAvatar, StatusBadge } from "@/components/Huiswerk";
import { Chip } from "@/components/ui";
import type { Row } from "@/screens/Dashboard";

const COLUMNS: Array<[SortKey, string]> = [
  ["name", "Leerling"], ["weekMinutes", "Oefentijd deze week"], ["status", "Huiswerk"], ["due", "Tot"], ["known", "Noten"], ["daysSinceLast", "Laatst geoefend"],
];
const FILTERS: StatusFilter[] = ["alle", "achter", "opletten", "goed", "geen"];

export function LeerlingenTabel({ rows, onOpenChild, onGiveMany, onChanged }: {
  rows: Row[]; onOpenChild(id: string): void; onGiveMany(ids: string[]): void; onChanged(): void;
}) {
  const { profile } = useApp();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [filter, setFilter] = useState<StatusFilter>("alle");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const table = useMemo(() => rows.map((r): TableRow => {
    const mine = r.homework.find((x) => x.h.givenBy === profile?.id);
    return {
      id: r.student.id, name: r.student.name, weekMinutes: r.summary.week.minutes,
      goalMinutes: mine ? mine.h.minutesPerDay * mine.p.goalDays : null,
      status: worstStatus(r.homework.map((x) => x.p.status)), due: mine?.h.dueDate ?? null,
      known: r.summary.notes.kent, daysSinceLast: r.summary.daysSinceLast,
      others: r.homework.filter((x) => x.h.givenBy !== profile?.id).map((x) => x.h),
    };
  }), [rows, profile?.id]);
  const shown = sortRows(filterRows(table, filter, query), sort.key, sort.dir);
  const count = (f: StatusFilter) => (f === "alle" ? table.length : table.filter((r) => r.status === f).length);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** zonder eigen doel: een blauwe balk naar verhouding van wie het meest oefende */
  const maxWeek = Math.max(1, ...table.map((r) => r.weekMinutes));
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.id));

  /** per leerling mijn laatste les opnieuw: de volgende les, met dezelfde opdrachten die meegaan (AC-124) */
  const repeat = async () => {
    let done = 0, none = 0;
    for (const id of picked) {
      const prev = rows.find((r) => r.student.id === id)?.homeworkAll.find((h) => h.givenBy === profile?.id && h.status !== "afgezegd");
      if (!prev) { none++; continue; }
      await client.homework.give([id], "volgende", { notes: prev.notes, minutesPerDay: prev.minutesPerDay, daysPerWeek: prev.daysPerWeek, remark: prev.remark },
        [], { [id]: prev.tasks.map((t) => t.id) });
      done++;
    }
    setNote(`${done} ${done === 1 ? "leerling heeft" : "leerlingen hebben"} het vorige huiswerk opnieuw gekregen${none ? `; ${none} had nog geen huiswerk van jou` : ""}.`);
    setPicked(new Set()); onChanged();
  };

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)} className="text-sm px-3 py-1.5">
            {f === "alle" ? "Alle" : STATUS_LABEL[f].replace(/^./, (c) => c.toUpperCase())} · {count(f)}
          </Chip>
        ))}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Zoek een leerling" aria-label="Zoek een leerling"
          className="ml-auto w-60 rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px]" />
      </div>

      {picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-fg text-bg px-4 py-2.5" role="region" aria-label="Gekozen leerlingen">
          <b>{picked.size} {picked.size === 1 ? "leerling" : "leerlingen"} gekozen</b>
          <span className="flex-1" />
          <Chip primary onClick={() => onGiveMany([...picked])}>Huiswerk geven</Chip>
          <Chip onClick={() => void repeat()} className="!text-fg">Vorig huiswerk herhalen</Chip>
          <button type="button" onClick={() => setPicked(new Set())} className="text-sm bg-transparent cursor-pointer text-bg/80">✕ wissen</button>
        </div>
      )}
      {note && <p role="status" className="m-0 text-sm rounded-xl bg-ok/10 text-ok px-3 py-2">{note}</p>}

      <div className="rounded-3xl bg-surface p-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-2 w-8"><input type="checkbox" aria-label="Alle getoonde leerlingen kiezen" checked={allShown}
                onChange={() => setPicked(allShown ? new Set() : new Set(shown.map((r) => r.id)))} className="w-5 h-5 accent-[var(--color-ok)]" /></th>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className="p-2 text-left text-xs font-semibold uppercase tracking-wider text-muted whitespace-nowrap"
                  aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="bg-transparent cursor-pointer uppercase tracking-wider font-semibold text-muted"
                    onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }))}>
                    {label}{sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th className="p-2 text-left text-xs font-semibold uppercase tracking-wider text-muted">Ook van</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={`border-t border-line ${picked.has(r.id) ? "bg-kent-soft" : ""}`}>
                <td className="p-2"><input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`${r.name} kiezen`} className="w-5 h-5 accent-[var(--color-ok)]" /></td>
                <td className="p-2"><button type="button" onClick={() => onOpenChild(r.id)} className="font-bold bg-transparent cursor-pointer hover:underline">{r.name}</button></td>
                <td className="p-2 whitespace-nowrap">
                  <span className="inline-block w-28 h-2 rounded bg-line overflow-hidden align-middle mr-2" aria-hidden="true">
                    <span className={`block h-full rounded ${r.goalMinutes === null ? "bg-kent" : r.weekMinutes >= r.goalMinutes ? "bg-ok" : "bg-les"}`}
                      style={{ width: `${Math.min(100, (100 * r.weekMinutes) / (r.goalMinutes ?? maxWeek))}%` }} />
                  </span>
                  {r.weekMinutes}{r.goalMinutes ? ` / ${r.goalMinutes}` : ""} min
                </td>
                <td className="p-2"><StatusBadge status={r.status} /></td>
                <td className="p-2 whitespace-nowrap">{r.due ? dueLabel(r.due) : "–"}</td>
                <td className="p-2">{r.known}</td>
                <td className="p-2 whitespace-nowrap">{r.daysSinceLast === null ? "nog nooit" : r.daysSinceLast === 0 ? "vandaag" : r.daysSinceLast === 1 ? "gisteren" : `${r.daysSinceLast} dagen geleden`}</td>
                <td className="p-2"><span className="flex -space-x-1.5">{r.others.map((h) => <GiverAvatar key={h.id} h={h} small />)}</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="p-4 text-muted">Geen leerlingen gevonden.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted m-0">“Ook van”: huiswerk dat een ouder gaf, met de avatar van die ouder. Tik op een naam voor de leerlingpagina.</p>
    </div>
  );
}
