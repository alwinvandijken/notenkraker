import { useEffect, useState } from "react";
import clsx from "clsx";
import { instrumentNotes, type StatusMap } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { childSummary, whenLabel, type ChildSummary, type Round, type Student } from "@notenkraker/client";
import { client, hasBackend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { noteLabel } from "@/lib/noten";
import { KindUitnodigen } from "@/components/KindUitnodigen";
import { Chip } from "@/components/ui";

/**
 * Startscherm voor een ouder of leraar (mock-up: docs/mockups/iPadA-Ouder.html): per kind of
 * leerling de oefentijd van deze week, de notenstatus en wat lastig is. Een leraar ziet de
 * leerlingen die het langst niet geoefend hebben bovenaan.
 */
interface Row { student: Student; rounds: Round[]; summary: ChildSummary; range: [string, string] }

export function Dashboard({ onPractice, onManage }: { onPractice(studentId: string): void; onManage(): void }) {
  const { profile, students } = useApp();
  const isLeraar = profile?.role === "leraar";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [invite, setInvite] = useState<{ name: string; code: string } | null>(null);

  useEffect(() => {
    let stale = false;
    void Promise.all(students.map(async (student): Promise<Row> => {
      const instrument = getInstrument(student.instrumentId);
      const [rounds, notes] = await Promise.all([client.rounds.recent(student.id, 200), client.notes.list(student.id)]);
      const statuses: StatusMap = Object.fromEntries(notes.map((n) => [n.noteId, n.status]));
      return { student, rounds, range: instrument.range, summary: childSummary({ rounds, statuses, noteIds: instrumentNotes(instrument) }) };
    })).then((list) => {
      if (stale) return;
      const never = (r: Row) => r.summary.daysSinceLast ?? Infinity;
      setRows(isLeraar ? [...list].sort((a, b) => never(b) - never(a)) : list);
    });
    return () => { stale = true; };
  }, [students, isLeraar]);

  if (!rows) return <p className="text-muted">Laden…</p>;
  const who = isLeraar ? "leerlingen" : "kinderen";
  if (rows.length === 0) {
    return (
      <div className="rounded-3xl bg-surface p-6 flex flex-col items-start gap-3">
        <p className="m-0">{isLeraar ? "Nog geen leerlingen. Voeg een leerling toe of koppel er een met een code van de ouder." : "Voeg eerst een kind toe."}</p>
        <Chip primary onClick={onManage}>{isLeraar ? "+ leerling" : "+ kind"}</Chip>
      </div>
    );
  }

  const practiced = rows.filter((r) => r.summary.week.rounds > 0).length;
  const weekRounds = rows.reduce((n, r) => n + r.summary.week.rounds, 0);
  const weekMinutes = rows.reduce((n, r) => n + r.summary.week.minutes, 0);
  const activity = rows.flatMap((r) => r.rounds.slice(0, 6).map((round) => ({ round, name: r.student.name })))
    .sort((a, b) => b.round.playedAt.localeCompare(a.round.playedAt)).slice(0, 6);

  async function letLogin(s: Student) {
    setInvite({ name: s.name, code: await client.students.inviteCode(s.id, "kind") });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat value={`${practiced} van ${rows.length}`} label={`${who} geoefend deze week`} />
        <Stat value={String(weekRounds)} label="rondes gespeeld" />
        <Stat value={`${weekMinutes} min`} label={isLeraar ? "geoefend" : "samen geoefend"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid gap-4 md:grid-cols-2 content-start">
          {rows.map((r) => (
            <ChildCard key={r.student.id} row={r} isOuder={profile?.role === "ouder"}
              onPractice={() => onPractice(r.student.id)} onLetLogin={() => void letLogin(r.student)} />
          ))}
        </div>
        <aside className="flex flex-col gap-4">
          <section className="rounded-3xl bg-surface p-4 flex flex-col">
            <Label>Laatste activiteit</Label>
            {activity.length === 0 && <p className="text-sm text-muted m-0 mt-2">Nog niets gespeeld.</p>}
            {activity.map(({ round, name }) => (
              <div key={round.id} className="flex gap-3 py-2.5 border-t border-line first-of-type:border-t-0 text-sm">
                <Avatar name={name} small />
                <span>{name} speelde het notenspel: <b>{round.answers.filter((a) => a.correct).length} van {round.answers.length} goed</b>
                  <span className="block text-xs text-muted">{whenLabel(round.playedAt)}</span></span>
              </div>
            ))}
          </section>
          <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
            <Label>{isLeraar ? "Leerlingen" : "Kinderen"}</Label>
            <div className="flex flex-wrap gap-2">
              <Chip onClick={onManage}>{isLeraar ? "+ leerling" : "+ kind"}</Chip>
              <Chip onClick={onManage}>{isLeraar ? "Koppel met code" : "Code voor leraar"}</Chip>
            </div>
          </section>
        </aside>
      </div>
      {invite && <KindUitnodigen name={invite.name} code={invite.code} onClose={() => setInvite(null)} />}
    </div>
  );
}

function ChildCard({ row, isOuder, onPractice, onLetLogin }: { row: Row; isOuder: boolean; onPractice(): void; onLetLogin(): void }) {
  const { student, summary: s, range } = row;
  const max = Math.max(...s.days.map((d) => d.minutes), 1);
  const pct = (n: number) => `${(100 * n) / Math.max(s.notes.total, 1)}%`;
  const today = s.days[6]!.minutes;
  return (
    <section className="rounded-3xl bg-surface p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={student.name} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-xl leading-tight truncate">{student.name}</div>
          <div className="text-sm text-muted">{getInstrument(student.instrumentId).name} · {student.userId ? "logt zelf in ✓" : "nog geen eigen login"}</div>
        </div>
        {s.streak > 1
          ? <span className="rounded-xl px-2.5 py-1 text-sm font-semibold bg-ok/15 text-ok whitespace-nowrap">🔥 {s.streak} dagen op rij</span>
          : (s.daysSinceLast === null || s.daysSinceLast >= 3) && (
            <span className="rounded-xl px-2.5 py-1 text-sm font-semibold bg-les/25 whitespace-nowrap">{s.daysSinceLast === null ? "nog niet geoefend" : `${s.daysSinceLast} dagen niet geoefend`}</span>
          )}
      </div>

      <div>
        <div className="flex justify-between"><Label>Oefentijd</Label>
          <span className="text-xs text-muted">{today ? `vandaag ${today} min` : s.daysSinceLast === null ? "" : `laatst ${s.daysSinceLast === 1 ? "gisteren" : `${s.daysSinceLast} dagen geleden`}`}</span></div>
        <div className="grid grid-cols-7 gap-1.5 items-end h-20 mt-2" aria-label="Oefenminuten per dag">
          {s.days.map((d, i) => (
            <div key={i} className="flex flex-col items-center justify-end gap-1 h-full text-[11px] text-muted" title={`${d.minutes} min`}>
              <div className={clsx("w-full rounded-lg", d.minutes ? "bg-kent" : "bg-line")} style={{ height: d.minutes ? `${Math.max(12, (52 * d.minutes) / max)}px` : "6px" }} />
              {d.label}
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Noten</Label>
        <div className="flex h-3.5 rounded-full overflow-hidden bg-line mt-2">
          <div className="bg-kent" style={{ width: pct(s.notes.kent) }} /><div className="bg-les" style={{ width: pct(s.notes.les) }} />
        </div>
        <div className="flex flex-wrap gap-x-4 text-sm text-muted mt-1.5">
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-kent mr-1.5" />{s.notes.kent} kent al</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-les mr-1.5" />{s.notes.les} in de les</span>
          <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-line mr-1.5" />{s.notes.nog} komen nog</span>
        </div>
      </div>

      {s.lesNotes.length > 0 && (
        <div>
          <Label>In de les</Label>
          <div className="flex flex-wrap gap-1.5 mt-2">{s.lesNotes.map((n) => <span key={n} className="rounded-xl px-2.5 py-1 font-bold bg-les text-fg">{noteLabel(n, range)}</span>)}</div>
        </div>
      )}

      <div>
        <Label>Nog lastig</Label>
        {s.weak.length ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {s.weak.map((w) => <span key={w.noteId} className="rounded-xl px-2.5 py-1 font-bold border-2 border-wrong text-wrong">{noteLabel(w.noteId, range)} <small className="font-medium">{w.wrong}× fout</small></span>)}
          </div>
        ) : <p className="text-sm text-muted m-0 mt-1">{s.week.rounds ? "Niets: deze week alles goed 👏" : "Deze week nog niet gespeeld."}</p>}
      </div>

      <div className="flex flex-wrap gap-2 mt-auto">
        <Chip primary className="flex-1" onClick={onPractice}>Oefenen met {student.name}</Chip>
        {isOuder && hasBackend && !student.userId && <Chip onClick={onLetLogin}>Laten inloggen</Chip>}
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl bg-surface px-4 py-3"><div className="font-display font-bold text-xl sm:text-2xl">{value}</div><div className="text-xs text-muted">{label}</div></div>;
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

function Avatar({ name, small }: { name: string; small?: boolean }) {
  return <span className={clsx("rounded-full bg-kent text-white font-bold flex items-center justify-center shrink-0", small ? "w-7 h-7 text-xs" : "w-11 h-11 text-lg")}>{name.slice(0, 1).toUpperCase()}</span>;
}
