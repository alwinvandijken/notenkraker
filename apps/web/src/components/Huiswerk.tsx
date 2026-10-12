/**
 * Huiswerk van een ouder of leraar (AC-113, mock-up docs/mockups/Leraar-Huiswerk.html). Elk huiswerk
 * is een eigen kaart; de avatar laat zien van wie het is (blauw = leraar, oranje = ouder).
 */
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  currentHomework, dueLabel, homeworkProgress, STATUS_LABEL,
  type Homework, type HomeworkProgress, type HomeworkTask, type HomeworkStatus, type PracticeSession, type Round,
} from "@notenkraker/client";
import { client } from "@/lib/client";
import { instrumentNotes } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { distinctLabels } from "@/lib/noten";
import { Donut } from "@/components/Donut";
import { OpdrachtenLijst } from "@/components/Opdrachten";

export interface CurrentHomework { h: Homework; p: HomeworkProgress }

/** lopend huiswerk met voortgang, nieuwste eerst */
export function withProgress(list: Homework[], rounds: Round[], sessions: PracticeSession[], now = new Date()): CurrentHomework[] {
  return currentHomework(list, now).map((h) => ({ h, p: homeworkProgress(h, { rounds, sessions, now }) }));
}

/** voor het oefenscherm van de leerling: laadt huiswerk, rondes en sessies zelf; null = laden */
export function useHomework(studentId: string | null | undefined): CurrentHomework[] | null {
  const [items, setItems] = useState<CurrentHomework[] | null>(null);
  useEffect(() => {
    if (!studentId) { setItems([]); return; }
    let stale = false;
    void Promise.all([client.homework.list(studentId), client.rounds.recent(studentId, 200), client.practice.recent(studentId, 50)])
      .then(([list, rounds, sessions]) => { if (!stale) setItems(withProgress(list, rounds, sessions)); })
      .catch(() => { if (!stale) setItems([]); });
    return () => { stale = true; };
  }, [studentId]);
  return items;
}

export function GiverAvatar({ h, small }: { h: Homework; small?: boolean }) {
  return (
    <span aria-hidden="true" className={clsx("rounded-full text-white font-bold flex items-center justify-center shrink-0",
      h.givenByRole === "leraar" ? "bg-kent" : "bg-accent", small ? "w-7 h-7 text-sm" : "w-9 h-9")}>
      {(h.givenByName || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

export function StatusBadge({ status }: { status: HomeworkStatus | "geen" }) {
  return (
    <span className={clsx("rounded-xl px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
      status === "goed" ? "bg-ok/15 text-ok" : status === "achter" ? "bg-wrong/15 text-wrong" : "bg-les/25")}>{STATUS_LABEL[status]}</span>
  );
}

/** bolletjes per dag: groen = gehaald, lichtgroen = de helft, omrand = vandaag */
function Dots({ p }: { p: HomeworkProgress }) {
  return (
    <div className="flex flex-wrap gap-1" aria-hidden="true">
      {p.days.map((d) => (
        <span key={d.date} title={`${d.label}: ${d.minutes} min`}
          className={clsx("w-4.5 h-4.5 rounded-[5px]", d.state === "ok" ? "bg-ok" : d.state === "half" ? "bg-ok/40" : "bg-line",
            d.today && "outline-2 outline-fg outline-offset-1")} />
      ))}
    </div>
  );
}

/** één regel per huiswerk, voor de grepentabel waar de ruimte krap is */
export function HuiswerkRegel({ item: { h, p }, instrumentId }: { item: CurrentHomework; instrumentId: string }) {
  const labels = useNoteLabels(instrumentId);
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-surface border-2 border-les px-3 py-2 text-sm min-w-0" aria-label={`Huiswerk van ${h.givenByName}`}>
      <GiverAvatar h={h} small />
      <span className="flex-1 min-w-0 truncate"><b>Vandaag {p.todayMinutes} van {h.minutesPerDay} min</b>
        {h.notes.length > 0 && <span className="text-muted"> · {h.notes.map((n) => labels[n] ?? n).join(" ")}</span>}</span>
      <span className="text-xs text-muted shrink-0">tot {dueLabel(h.dueDate)}</span>
    </div>
  );
}

/**
 * Eén huiswerkkaart. `mine` = door de ingelogde gebruiker gegeven (dan "Jij" en aanpassen);
 * `pupil` = voor de leerling zelf, met een donut van vandaag.
 */
/** namen voor alle noten van het instrument, zonder dubbele ("C", "C hoog") */
export function useNoteLabels(instrumentId: string) {
  return useMemo(() => { const inst = getInstrument(instrumentId); return distinctLabels(instrumentNotes(inst), inst.starterNotes); }, [instrumentId]);
}

export function HuiswerkKaart({ item: { h, p }, instrumentId, mine, pupil, onEdit, mayRecord, onRecord }: {
  item: CurrentHomework; instrumentId: string; mine?: boolean; pupil?: boolean; onEdit?(): void;
  /** de leerling mag opnames insturen (18+, eigen profiel, of toestemming van de ouder) */
  mayRecord?: boolean; onRecord?(task: HomeworkTask): void;
}) {
  const labels = useNoteLabels(instrumentId);
  return (
    <section className={clsx("rounded-3xl bg-surface p-4 flex flex-col gap-3 min-w-0", pupil && "border-2 border-les")}
      aria-label={`Huiswerk van ${h.givenByName}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <GiverAvatar h={h} small />
        <span className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wider text-muted truncate">
          {pupil ? `Huiswerk van ${h.givenByName}` : mine ? "Jij" : h.givenByName} · tot {dueLabel(h.dueDate)}
        </span>
        {pupil ? null : <StatusBadge status={p.status} />}
      </div>

      {pupil && (
        <div className="flex items-center gap-3">
          <Donut percent={Math.round((100 * p.todayMinutes) / h.minutesPerDay)} size={56} stroke={7}>
            <span className="text-[10px] font-bold">{p.todayMinutes}/{h.minutesPerDay}</span>
          </Donut>
          <div className="min-w-0">
            <b className="block">Vandaag {p.todayMinutes} van {h.minutesPerDay} min</b>
            <span className="text-sm text-muted">{p.doneDays} van {p.goalDays} dagen gehaald</span>
          </div>
        </div>
      )}

      {h.notes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{h.notes.map((n) => <span key={n} className="rounded-xl px-2.5 py-1 font-bold bg-les text-fg text-sm">{labels[n] ?? n}</span>)}</div>
      )}
      {h.piece && <div className="text-sm">🎵 <b>{h.piece}</b>{h.pieceNote ? `, ${h.pieceNote}` : ""}</div>}
      <OpdrachtenLijst tasks={h.tasks} viewer={pupil ? "pupil" : mine ? "giver" : "other"} mayRecord={mayRecord} onRecord={onRecord} dueDate={h.dueDate} />
      {h.remark && <div className="text-sm rounded-xl bg-bg px-3 py-2 whitespace-pre-line">💬 “{h.remark}”</div>}

      {!pupil && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-2 text-sm"><span>{h.minutesPerDay} min per dag, {p.goalDays} {p.goalDays === 1 ? "dag" : "dagen"}</span><b className="shrink-0">{p.doneDays} van {p.goalDays} dagen</b></div>
          <Dots p={p} />
        </div>
      )}
      {mine && onEdit && (
        <button type="button" onClick={onEdit} className="self-start text-sm font-semibold text-kent bg-transparent cursor-pointer">Aanpassen →</button>
      )}
    </section>
  );
}
