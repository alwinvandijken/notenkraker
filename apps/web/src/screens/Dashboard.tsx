import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { instrumentNotes, type StatusMap } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import {
  childSummary, dateKey, dueLabel, playedOfTotal, whenLabel, worstStatus, type ChildSummary, type PracticeSession, type Round, type SessionSummary, type Student,
} from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip } from "@/components/ui";
import { Donut } from "@/components/Donut";
import { ICON } from "@/lib/iconen";
import { GiverAvatar, StatusBadge, withProgress, type CurrentHomework } from "@/components/Huiswerk";

/**
 * Startscherm voor een ouder of leraar (mock-up: docs/mockups/iPadA-Ouder.html). Het overzicht
 * houdt het kort: per kind een kaart met deze week en de laatste activiteit, zonder noten. Tik
 * op een kaart voor de pagina van dat kind (KindPagina.tsx), op een dag of activiteit voor de
 * dagpagina (DagPagina.tsx) met alle details. Zo blijft het
 * ook op een staande iPhone leesbaar. Een leraar ziet wie achterloopt met het huiswerk bovenaan,
 * daarna wie het langst niet oefende.
 */
export interface Row { student: Student; rounds: Round[]; sessions: PracticeSession[]; summary: ChildSummary; range: [string, string]; homework: CurrentHomework[] }

/** volgorde voor de leraar: loopt achter, even opletten, geen huiswerk, gaat goed */
const HOMEWORK_ORDER = { achter: 0, opletten: 1, geen: 2, goed: 3 } as const;
const rowStatus = (r: Row) => worstStatus(r.homework.map((x) => x.p.status));

/** rondes, sessies en notenstatus per kind; null = nog aan het laden */
export function useChildRows(): Row[] | null {
  const { profile, students } = useApp();
  const isLeraar = profile?.role === "leraar";
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let stale = false;
    void Promise.all(students.map(async (student): Promise<Row> => {
      const instrument = getInstrument(student.instrumentId);
      const [rounds, notes, sessions, homework] = await Promise.all([
        client.rounds.recent(student.id, 200), client.notes.list(student.id), client.practice.recent(student.id, 50), client.homework.list(student.id),
      ]);
      const statuses: StatusMap = Object.fromEntries(notes.map((n) => [n.noteId, n.status]));
      return {
        student, rounds, sessions, range: instrument.range, homework: withProgress(homework, rounds, sessions),
        summary: childSummary({ rounds, sessions, statuses, noteIds: instrumentNotes(instrument) }),
      };
    })).then((list) => {
      if (stale) return;
      const never = (r: Row) => r.summary.daysSinceLast ?? Infinity;
      setRows(isLeraar ? [...list].sort((a, b) => HOMEWORK_ORDER[rowStatus(a)] - HOMEWORK_ORDER[rowStatus(b)] || never(b) - never(a)) : list);
    });
    return () => { stale = true; };
  }, [students, isLeraar]);
  return rows;
}

export function Dashboard({ onOpenChild, onOpenDay, onManage }: { onOpenChild(studentId: string): void; onOpenDay(studentId: string, date: string): void; onManage(): void }) {
  const { profile } = useApp();
  const isLeraar = profile?.role === "leraar";
  const rows = useChildRows();

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

  const practiced = rows.filter((r) => r.summary.week.minutes > 0).length;
  const weekMinutes = rows.reduce((n, r) => n + r.summary.week.minutes, 0);
  const activity = rows.flatMap((r) => activityOf(r, rows.length > 1)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="grid grid-cols-2 gap-3">
        <Stat value={`${practiced} van ${rows.length}`} label={`${who} geoefend deze week`} />
        <Stat value={`${weekMinutes} min`} label={isLeraar ? "geoefend deze week" : "samen geoefend deze week"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px] min-w-0">
        <div className="grid gap-3 md:grid-cols-2 content-start min-w-0">
          {rows.map((r) => <ChildCard key={r.student.id} row={r} onOpen={() => onOpenChild(r.student.id)} />)}
        </div>
        <section className="rounded-3xl bg-surface p-4 flex flex-col min-w-0 self-start w-full">
          <Label>Laatste activiteit</Label>
          {activity.length === 0 && <p className="text-sm text-muted m-0 mt-2">Nog niets gespeeld.</p>}
          {activity.map((a) => <ActivityRow key={a.id} item={a} onOpen={() => onOpenDay(a.studentId, dateKey(new Date(a.at)))} />)}
        </section>
      </div>
    </div>
  );
}

/** compacte kaart op het overzicht; de details staan op de pagina van het kind */
function ChildCard({ row, onOpen }: { row: Row; onOpen(): void }) {
  const { student, summary: s } = row;
  const max = Math.max(...s.days.map((d) => d.minutes), 1);
  const last = activityOf(row, false)[0];
  return (
    <button type="button" onClick={onOpen} aria-label={`${student.name}: details`}
      className="rounded-3xl bg-surface p-4 flex flex-col gap-3 text-left cursor-pointer border-2 border-transparent hover:border-line min-w-0">
      <div className="flex items-center gap-3 w-full">
        <Avatar name={student.name} />
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-xl leading-tight truncate">{student.name}</div>
          <StreakBadge summary={s} />
        </div>
        <span className="text-2xl text-muted" aria-hidden="true">›</span>
      </div>
      <div className="flex items-end gap-3 w-full">
        <div className="shrink-0">
          <div className="font-display font-bold text-2xl leading-none">{s.week.minutes} min</div>
          <div className="text-xs text-muted mt-1">deze week{s.days[6]!.minutes ? ` · vandaag ${s.days[6]!.minutes}` : ""}</div>
        </div>
        <div className="flex-1 grid grid-cols-7 gap-1 items-end h-10" aria-hidden="true">
          {s.days.map((d, i) => d.minutes ? (
            <span key={i} className="rounded-sm overflow-hidden flex flex-col" style={{ height: `${Math.max(6, (40 * d.minutes) / max)}px` }}>
              <span className="bg-accent" style={{ flex: d.free }} /><span className="bg-kent" style={{ flex: d.game }} />
            </span>
          ) : <span key={i} className="rounded-sm bg-line h-1" />)}
        </div>
      </div>
      {row.homework.length > 0 && (
        <div className="flex items-center gap-2 text-sm w-full min-w-0 border-t border-line pt-3">
          <span className="flex -space-x-1.5 shrink-0">{row.homework.map((x) => <GiverAvatar key={x.h.id} h={x.h} small />)}</span>
          <span className="flex-1 min-w-0 truncate">Huiswerk tot {dueLabel(row.homework.map((x) => x.h.dueDate).sort()[0]!)}</span>
          <StatusBadge status={rowStatus(row)} />
        </div>
      )}
      {last && (
        <div className="flex items-center gap-2 text-sm w-full min-w-0 border-t border-line pt-3">
          <ActivityIcon kind={last.kind} />
          <span className="flex-1 min-w-0 truncate">{last.short}</span>
          <span className="text-xs text-muted shrink-0">{whenLabel(last.at)}</span>
        </div>
      )}
    </button>
  );
}

interface ActivityItem { id: string; at: string; studentId: string; kind: "vrij" | "spel"; text: React.ReactNode; short: string; sub: string; end: React.ReactNode }

/** spelrondes en sessies vrij oefenen van één kind, nieuwste eerst */
export function activityOf(r: Row, withName: boolean): ActivityItem[] {
  const who = withName ? `${r.student.name} ` : "";
  return [
    ...r.rounds.slice(0, 6).map((round): ActivityItem => {
      const score = `${round.answers.filter((a) => a.correct).length} van ${round.answers.length} goed`;
      return {
        id: round.id, at: round.playedAt, studentId: r.student.id, kind: "spel",
        text: <>{who}{withName ? "speelde het notenspel" : "Notenspel"}: <b>{score}</b></>, short: `Notenspel: ${score}`,
        sub: `${Math.max(1, Math.round(round.ms / 60_000))} min`,
        end: <span className="text-key text-sm tracking-wider shrink-0" aria-label={`${round.stars} sterren`}>{"★".repeat(round.stars)}{"☆".repeat(3 - round.stars)}</span>,
      };
    }),
    ...r.summary.sessions.map((p): ActivityItem => ({
      id: p.id, at: p.startedAt, studentId: r.student.id, kind: "vrij",
      text: <>{who}{withName ? "oefende vrij" : "Vrij oefenen"}: <b>{playedOfTotal(p.playedSeconds, p.totalSeconds)}</b></>,
      short: `Vrij oefenen: ${playedOfTotal(p.playedSeconds, p.totalSeconds)}`,
      sub: "",
      end: <Donut percent={p.percent} size={34}><span className="text-[9px] font-bold">{p.percent}%</span></Donut>,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

export function ActivityRow({ item: a, onOpen }: { item: ActivityItem; onOpen(): void }) {
  return (
    <button type="button" onClick={onOpen}
      className="w-full flex items-center gap-3 py-2.5 border-t border-line first-of-type:border-t-0 text-sm text-left bg-transparent cursor-pointer hover:bg-bg rounded-lg min-w-0">
      <ActivityIcon kind={a.kind} />
      <span className="flex-1 min-w-0">{a.text}
        <span className="block text-xs text-muted truncate">{whenLabel(a.at)}{a.sub ? ` · ${a.sub}` : ""}</span></span>
      {a.end}
    </button>
  );
}

/** oefentijd per dag: 4 dagen in beeld, horizontaal terug te scrollen; tik voor details */
export function PracticeChart({ summary: s, onOpenDay }: { summary: ChildSummary; onOpenDay(date: string): void }) {
  const max = Math.max(...s.history.map((d) => d.minutes), 1);
  const scroller = useRef<HTMLDivElement>(null);
  // begin bij vandaag (rechts); naar links scrollen gaat terug in de tijd
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const toEnd = () => { el.scrollLeft = el.scrollWidth; };
    toEnd();
    // de breedte is soms pas na de eerste layout bekend
    const id = requestAnimationFrame(toEnd);
    return () => cancelAnimationFrame(id);
  }, []);
  const todayKey = dateKey(new Date());
  return (
    <div className="min-w-0">
      <div ref={scroller} className="flex overflow-x-auto snap-x snap-mandatory -mx-1 pb-1 [scrollbar-width:thin]" aria-label="Oefenminuten per dag, scroll terug in de tijd">
        {s.history.map((d) => (
          <button key={d.date} type="button" onClick={() => onOpenDay(d.date)} aria-label={`${d.label}: ${d.free} min vrij oefenen, ${d.game} min notenspel`}
            className="snap-end shrink-0 basis-1/4 px-1.5 h-28 flex flex-col items-stretch justify-end gap-1 bg-transparent cursor-pointer rounded-xl hover:bg-bg">
            <span className="text-xs font-semibold text-center">{d.minutes ? `${d.minutes} min` : ""}</span>
            {d.minutes ? (
              <span className="w-full rounded-lg overflow-hidden flex flex-col" style={{ height: `${Math.max(12, (64 * d.minutes) / max)}px` }}>
                <span className="bg-accent" style={{ flex: d.free }} /><span className="bg-kent" style={{ flex: d.game }} />
              </span>
            ) : <span className="w-full rounded-lg bg-line h-1.5" />}
            <span className={`text-[11px] text-center ${d.date === todayKey ? "font-bold text-fg" : "text-muted"}`}>{d.date === todayKey ? "vandaag" : d.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mt-1.5">
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-accent mr-1.5" />{ICON.vrij} vrij oefenen</span>
        <span><i className="inline-block w-2.5 h-2.5 rounded-sm bg-kent mr-1.5" />{ICON.spel} notenspel</span>
        <span>tik op een dag voor details</span>
      </div>
    </div>
  );
}

export function SessionRow({ session: p, onOpen }: { session: SessionSummary; onOpen(): void }) {
  return (
    <button type="button" onClick={onOpen}
      className="w-full flex items-center gap-3 py-2.5 border-t border-line first-of-type:border-t-0 text-sm text-left bg-transparent cursor-pointer hover:bg-bg min-w-0">
      <Donut percent={p.percent} size={40}><span className="text-[10px] font-bold">{p.percent}%</span></Donut>
      <span className="flex-1 min-w-0"><b>{playedOfTotal(p.playedSeconds, p.totalSeconds)}</b> gespeeld
        <span className="block text-xs text-muted truncate">{whenLabel(p.startedAt)}</span></span>
      {p.label === "twijfel"
        ? <span className="rounded-xl px-2 py-1 text-xs font-semibold bg-les/25 shrink-0" title="Minuten lang steeds dezelfde noot">twijfel&shy;achtig</span>
        : <span className="rounded-xl px-2 py-1 text-xs font-semibold bg-ok/15 text-ok shrink-0">sax ✓</span>}
    </button>
  );
}

export function StreakBadge({ summary: s }: { summary: ChildSummary }) {
  if (s.streak > 1) return <span className="inline-block mt-1 rounded-xl px-2 py-0.5 text-xs font-semibold bg-ok/15 text-ok">🔥 {s.streak} dagen op rij</span>;
  if (s.daysSinceLast === null) return <span className="inline-block mt-1 rounded-xl px-2 py-0.5 text-xs font-semibold bg-les/25">nog niet geoefend</span>;
  if (s.daysSinceLast >= 3) return <span className="inline-block mt-1 rounded-xl px-2 py-0.5 text-xs font-semibold bg-les/25">{s.daysSinceLast} dagen niet geoefend</span>;
  return <span className="block text-xs text-muted mt-0.5">laatst geoefend {s.daysSinceLast === 0 ? "vandaag" : s.daysSinceLast === 1 ? "gisteren" : `${s.daysSinceLast} dagen geleden`}</span>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-2xl bg-surface px-4 py-3 min-w-0"><div className="font-display font-bold text-xl sm:text-2xl">{value}</div><div className="text-xs text-muted">{label}</div></div>;
}

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold uppercase tracking-wider text-muted">{children}</span>;
}

function ActivityIcon({ kind }: { kind: "vrij" | "spel" }) {
  return <span aria-hidden="true" className={clsx("w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0", kind === "vrij" ? "bg-accent-soft" : "bg-kent-soft")}>{ICON[kind]}</span>;
}

export function Avatar({ name }: { name: string }) {
  return <span className="rounded-full bg-kent text-white font-bold flex items-center justify-center shrink-0 w-11 h-11 text-lg">{name.slice(0, 1).toUpperCase()}</span>;
}
