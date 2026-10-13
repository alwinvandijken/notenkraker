import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { dueLabel, taskReference, type HomeworkTask, type Student } from "@notenkraker/client";
import { ageProfile, instrumentNotes } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { namesLabel, planVandaag, recordingsThisLesson, suggestion, type VandaagRow } from "@/lib/vandaag";
import { GiverAvatar, mayRecord as mayRecordFor, useNoteLabels } from "@/components/Huiswerk";
import { loadToday, type TodayData } from "@/lib/vandaagData";
import { Donut } from "@/components/Donut";
import { Chip, Week } from "@/components/ui";

export type Mode = "learn" | "game" | "vrij";

/**
 * Vandaag, het startscherm van de leerling (AC-120 PR 2, mock-up docs/ux-review/vandaag.html).
 * Links het huiswerk van ouder en leraar als één takenlijst met één oranje knop; zonder huiswerk het
 * dagdoel en een voorstel. Spelen, Grepen en Vrij spelen staan in de tabbalk, niet nog eens hier.
 */
export function Vandaag({ student, withHomework = true, onPlay, onOpenTask, footer }: {
  student: Student;
  /** zonder account is er geen huiswerk */
  withHomework?: boolean;
  onPlay(m: Mode): void;
  /** een taak openen: één pagina met bladmuziek, voorbeeld, opnemen en reacties */
  onOpenTask?(task: HomeworkTask): void;
  /** onderaan rechts, bijvoorbeeld de uitnodiging voor een account */
  footer?: ReactNode;
}) {
  const { statuses } = useApp();
  const labels = useNoteLabels(student.instrumentId);
  const [data, setData] = useState<TodayData | null>(null);
  /** afgevinkte opdrachten, meteen zichtbaar; de database volgt */
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  const dailyGoal = ageProfile(student.ageBand).dailyGoal;
  useEffect(() => {
    let stale = false;
    void loadToday(student.id, { withHomework, dailyGoal }).then((d) => { if (!stale) setData(d); });
    return () => { stale = true; };
  }, [student.id, withHomework, dailyGoal]);

  if (!data) return <p className="text-muted">Laden…</p>;

  const items = data.items.map(({ h, p }) => ({ h: { ...h, tasks: h.tasks.map((t) => (t.id in ticked ? { ...t, doneAt: ticked[t.id] ? new Date().toISOString() : null } : t)) }, p }));
  const mayRecord = mayRecordFor(student);
  const plan = planVandaag(items, { mayRecord });
  const tick = async (t: HomeworkTask) => {
    const next = !t.doneAt;
    setTicked((d) => ({ ...d, [t.id]: next }));
    try { await client.homework.setTaskDone(t.homeworkItemId, student.id, next); } catch { setTicked((d) => ({ ...d, [t.id]: !next })); }
  };
  const profile = ageProfile(student.ageBand);
  const known = instrumentNotes(getInstrument(student.instrumentId)).filter((n) => statuses[n] === "kent").length;

  let card: ReactNode;
  if (plan) {
    const left = Math.max(0, plan.goal - plan.today);
    const start = () => (plan.next?.kind === "opname" ? onOpenTask?.(plan.next.task) : onPlay("game"));
    const remarks = items.filter((x) => x.h.remark);
    card = (
      <>
        <Ring today={plan.today} goal={plan.goal}
          title={left > 0 ? `Nog ${left} ${left === 1 ? "minuut" : "minuten"}` : "Minuten gehaald!"}
          sub={`huiswerk van ${namesLabel(plan.givers)} · tot ${dueLabel(plan.due)}`} />
        <ul aria-label="Huiswerk" className="m-0 p-0 list-none flex flex-col">
          {plan.rows.map((r) => <Row key={r.key} row={r} labels={labels} onTick={(t) => void tick(t)} onOpen={onOpenTask} />)}
        </ul>
        {remarks.map(({ h }) => (
          <div key={h.id} className="flex items-start gap-2.5 rounded-2xl bg-bg p-3">
            <GiverAvatar h={h} small /><span className="text-sm whitespace-pre-line"><b>{h.givenByName}:</b> “{h.remark}”</span>
          </div>
        ))}
        {plan.allDone && <p className="m-0 font-semibold text-ok">Alles af voor vandaag. Goed gedaan! 🎉</p>}
        <Chip primary onClick={start} className="py-3 text-lg">
          {plan.allDone ? "Nog meer spelen" : plan.started ? "Verder oefenen" : "Begin met oefenen"}
        </Chip>
      </>
    );
  } else {
    const goal = data.goal;
    const idea = suggestion(statuses, labels);
    card = (
      <>
        <Ring today={data.today} goal={goal} title={`Dagdoel: ${goal} minuten`}
          sub={`${data.today ? `vandaag ${data.today} min geoefend` : "nog niet geoefend vandaag"} · ${known} ${known === 1 ? "noot" : "noten"} die je kent`} />
        <div className="rounded-2xl bg-bg p-4"><b className="block">Voorstel</b><span className="text-muted">{idea.text}</span></div>
        <Chip primary onClick={() => onPlay(idea.mode)} className="py-3 text-lg">{data.today ? "Verder oefenen" : "Begin met oefenen"}</Chip>
      </>
    );
  }

  // Spelen, Grepen en Vrij spelen staan al in de tabbalk; hier alleen wat er vandaag moet
  return (
    <div className="flex flex-col gap-3 max-w-[760px]">
      <section aria-label="Vandaag" className="rounded-3xl bg-surface p-5 flex flex-col gap-4 min-w-0">
        {card}
        {data.streak > 0 && <p className="m-0 text-sm text-muted text-center"><span aria-hidden="true">🔥 </span>{data.streak} {data.streak === 1 ? "dag" : "dagen"} op rij geoefend</p>}
      </section>
      {footer}
    </div>
  );
}

function Ring({ today, goal, title, sub }: { today: number; goal: number; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-4">
      <Donut percent={Math.round((100 * today) / goal)} size={64} stroke={8}><span className="text-xs font-bold">{today}/{goal}</span></Donut>
      <div className="min-w-0">
        <b className="font-display text-xl block">{title}</b>
        <span className="text-sm text-muted">{sub}</span>
      </div>
    </div>
  );
}

function Box({ done, onClick, label }: { done: boolean; onClick?(): void; label?: string }) {
  const cls = clsx("w-6 h-6 rounded-lg border-2 shrink-0 flex items-center justify-center text-sm text-white", done ? "bg-ok border-ok" : "border-line bg-surface");
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={done} aria-label={label} className={clsx(cls, "cursor-pointer")}>{done ? "✓" : ""}</button>
    : <span aria-hidden="true" className={cls}>{done ? "✓" : ""}</span>;
}

/** een tik op een taak opent de taakpagina; afvinken kan ook meteen in de lijst */
function Row({ row: r, labels, onTick, onOpen }: {
  row: VandaagRow; labels: Record<string, string>; onTick(t: HomeworkTask): void; onOpen?(t: HomeworkTask): void;
}) {
  const line = "flex items-center gap-3 py-3 border-t border-line first:border-t-0 min-w-0";
  if (r.kind === "groep") {
    return <li className="pt-4 pb-1 border-t border-line first:border-t-0"><h2 className="font-display font-bold text-base m-0">{r.title} <span className="font-normal text-muted text-sm">· tot {dueLabel(r.due)}</span></h2></li>;
  }
  const week = r.kind !== "minuten" && r.task && r.task.week > 1 ? <> <Week n={r.task.week} /></> : null;
  const text = (title: string, sub: string, done = false) => (
    <span className="flex-1 min-w-0">
      <b className={clsx("block", done && "line-through text-muted")}>{title}{week}</b>
      {sub && <span className="text-sm text-muted block">{sub}</span>}
    </span>
  );
  /** de tekst (en het pijltje) als knop naar de taakpagina */
  const open = (task: HomeworkTask | undefined, content: ReactNode) => task && onOpen
    ? <button type="button" onClick={() => onOpen(task)} className="flex items-center gap-3 flex-1 min-w-0 text-left bg-transparent cursor-pointer p-0">
        {content}<span aria-hidden="true" className="text-muted text-xl">›</span></button>
    : content;
  if (r.kind === "minuten") {
    return (
      <li className={line}>
        <Box done={r.done} />
        {text(`${r.goal} minuten oefenen`, `spelen, vrij spelen en opnemen tellen mee · ${r.doneDays} van ${r.goalDays} dagen`)}
        {r.notes.length > 0 && <span className="flex flex-wrap justify-end gap-1">{r.notes.map((n) => <span key={n} className="rounded-lg px-2 py-0.5 font-bold bg-les text-fg text-sm">{labels[n] ?? n}</span>)}</span>}
      </li>
    );
  }
  if (r.kind === "opdracht") {
    return <li className={line}><Box done={r.done} onClick={() => onTick(r.task)} label={`${r.task.title} ${r.done ? "gedaan" : "nog niet gedaan"}`} />{open(r.task, text(r.task.title, taskReference(r.task), r.done))}</li>;
  }
  if (r.kind === "opname") {
    // deze les; een stuk dat meeging heeft ook opnames van vorige weken (op de taakpagina per week)
    const deze = recordingsThisLesson(r.task);
    const n = deze.length;
    const reacted = r.task.recordings.filter((x) => x.reactedAt).at(-1);
    const sub = n ? [`${n} ${n === 1 ? "opname" : "opnames"} ingestuurd`, reacted && `reactie ${reacted.reactionEmoji || "✓"}`].filter(Boolean).join(" · ") : taskReference(r.task);
    return <li className={line}>{open(r.task, <><span aria-hidden="true" className="w-6 text-center text-xl shrink-0">🎙️</span>{text(`${r.task.title} opnemen`, sub)}{r.done && <Box done />}</>)}</li>;
  }
  return <li className={line}>{open(r.task, <><span aria-hidden="true" className="w-6 text-center text-xl shrink-0">🎵</span>{text(r.title, r.task ? taskReference(r.task) : r.detail)}</>)}</li>;
}
