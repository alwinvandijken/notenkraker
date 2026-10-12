import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { childSummary, dueLabel, taskReference, type HomeworkTask, type Student } from "@notenkraker/client";
import { ageProfile, instrumentNotes } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { namesLabel, planVandaag, suggestion, type VandaagRow } from "@/lib/vandaag";
import { HuiswerkKaart, mayRecord as mayRecordFor, useNoteLabels, withProgress, type CurrentHomework } from "@/components/Huiswerk";
import { Donut } from "@/components/Donut";
import { Chip } from "@/components/ui";

export type Mode = "learn" | "game" | "vrij";

/**
 * Vandaag, het startscherm van de leerling (AC-120 PR 2, mock-up docs/ux-review/vandaag.html).
 * Links het huiswerk van ouder en leraar als één takenlijst met één oranje knop; zonder huiswerk het
 * dagdoel en een voorstel. Rechts de drie dingen die je altijd kunt doen.
 */
export function Vandaag({ student, withHomework = true, onPlay, onRecord, footer }: {
  student: Student;
  /** zonder account is er geen huiswerk */
  withHomework?: boolean;
  onPlay(m: Mode): void;
  onRecord?(task: HomeworkTask): void;
  /** onderaan rechts, bijvoorbeeld de uitnodiging voor een account */
  footer?: ReactNode;
}) {
  const { statuses } = useApp();
  const labels = useNoteLabels(student.instrumentId);
  const [data, setData] = useState<{ items: CurrentHomework[]; today: number; streak: number } | null>(null);
  /** afgevinkte opdrachten, meteen zichtbaar; de database volgt */
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let stale = false;
    void Promise.all([
      withHomework ? client.homework.list(student.id).catch(() => []) : Promise.resolve([]),
      client.rounds.recent(student.id, 200), client.practice.recent(student.id, 50),
    ]).then(([list, rounds, sessions]) => {
      if (stale) return;
      const summary = childSummary({ rounds, sessions, statuses: {}, noteIds: [] });
      setData({ items: withProgress(list, rounds, sessions), today: summary.days[6]!.minutes, streak: summary.streak });
    });
    return () => { stale = true; };
  }, [student.id, withHomework]);

  if (!data) return <p className="text-muted">Laden…</p>;

  const items = data.items.map(({ h, p }) => ({ h: { ...h, tasks: h.tasks.map((t) => (t.id in ticked ? { ...t, doneAt: ticked[t.id] ? new Date().toISOString() : null } : t)) }, p }));
  const mayRecord = mayRecordFor(student);
  const plan = planVandaag(items, { mayRecord });
  const tick = async (t: HomeworkTask) => {
    const next = !t.doneAt;
    setTicked((d) => ({ ...d, [t.id]: next }));
    try { await client.homework.setTaskDone(t.id, next); } catch { setTicked((d) => ({ ...d, [t.id]: !next })); }
  };
  const profile = ageProfile(student.ageBand);
  const known = instrumentNotes(getInstrument(student.instrumentId)).filter((n) => statuses[n] === "kent").length;

  let card: ReactNode;
  if (plan) {
    const left = Math.max(0, plan.goal - plan.today);
    const start = () => (plan.next?.kind === "opname" ? onRecord?.(plan.next.task) : onPlay("game"));
    card = (
      <>
        <Ring today={plan.today} goal={plan.goal}
          title={left > 0 ? `Nog ${left} ${left === 1 ? "minuut" : "minuten"}` : "Minuten gehaald!"}
          sub={`huiswerk van ${namesLabel(plan.givers)} · tot ${dueLabel(plan.due)}`} />
        <ul aria-label="Huiswerk" className="m-0 p-0 list-none flex flex-col">
          {plan.rows.map((r) => <Row key={r.key} row={r} labels={labels} mayRecord={mayRecord} onTick={(t) => void tick(t)} onRecord={onRecord} />)}
        </ul>
        <HeleHuiswerk items={items} instrumentId={student.instrumentId} mayRecord={mayRecord} onRecord={onRecord} />
        {plan.allDone && <p className="m-0 font-semibold text-ok">Alles af voor vandaag. Goed gedaan! 🎉</p>}
        <Chip primary onClick={start} className="mt-auto py-3 text-lg">
          {plan.allDone ? "Nog meer spelen" : plan.started ? "Verder oefenen" : "Begin met oefenen"}
        </Chip>
      </>
    );
  } else {
    const goal = profile.dailyGoal;
    const idea = suggestion(statuses, labels);
    card = (
      <>
        <Ring today={data.today} goal={goal} title={`Dagdoel: ${goal} minuten`}
          sub={`${data.today ? `vandaag ${data.today} min geoefend` : "nog niet geoefend vandaag"} · ${known} ${known === 1 ? "noot" : "noten"} die je kent`} />
        <div className="rounded-2xl bg-bg p-4"><b className="block">Voorstel</b><span className="text-muted">{idea.text}</span></div>
        <Chip primary onClick={() => onPlay(idea.mode)} className="mt-auto py-3 text-lg">{data.today ? "Verder oefenen" : "Begin met oefenen"}</Chip>
      </>
    );
  }

  const tiles: Array<{ m: Mode; icon: string; title: string; text: string; tint: string }> = [
    { m: "game", icon: "🎮", title: "Spelen", text: `${profile.roundLength} noten, ${profile.lives} levens`, tint: "bg-kent-soft" },
    { m: "learn", icon: "🎷", title: "Grepen", text: "welke kleppen bij een noot horen", tint: "bg-kent-soft" },
    { m: "vrij", icon: "🎙️", title: "Vrij spelen", text: "de app luistert en telt mee", tint: "bg-accent-soft" },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)]">
      <section aria-label="Vandaag" className="rounded-3xl bg-surface p-5 flex flex-col gap-4 min-w-0">{card}</section>
      <div className="flex flex-col gap-3 min-w-0">
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
          {tiles.map((t) => (
            <button key={t.m} type="button" onClick={() => onPlay(t.m)}
              className="rounded-3xl bg-surface p-4 flex items-center gap-3 text-left cursor-pointer border-2 border-transparent hover:border-line min-w-0">
              <span className={`w-12 h-12 rounded-2xl ${t.tint} flex items-center justify-center text-2xl shrink-0`} aria-hidden="true">{t.icon}</span>
              <span className="min-w-0"><b className="font-display text-lg block">{t.title}</b><span className="text-sm text-muted hidden sm:block">{t.text}</span></span>
            </button>
          ))}
          {data.streak > 0 && (
            <div className="rounded-3xl bg-surface p-4 flex items-center gap-2 text-muted lg:mt-2">
              <span aria-hidden="true" className="text-2xl">🔥</span>{data.streak} {data.streak === 1 ? "dag" : "dagen"} op rij geoefend
            </div>
          )}
        </div>
        {footer}
      </div>
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

function Row({ row: r, labels, mayRecord, onTick, onRecord }: {
  row: VandaagRow; labels: Record<string, string>; mayRecord: boolean; onTick(t: HomeworkTask): void; onRecord?(t: HomeworkTask): void;
}) {
  const line = "flex items-center gap-3 py-3 border-t border-line first:border-t-0 min-w-0";
  const text = (title: string, sub: string, done = false) => (
    <span className="flex-1 min-w-0">
      <b className={clsx("block", done && "line-through text-muted")}>{title}</b>
      {sub && <span className="text-sm text-muted block">{sub}</span>}
    </span>
  );
  if (r.kind === "minuten") {
    return (
      <li className={line}>
        <Box done={r.done} />
        {text(`${r.goal} minuten oefenen`, `spelen en vrij spelen tellen mee · ${r.doneDays} van ${r.goalDays} dagen`)}
        {r.notes.length > 0 && <span className="flex flex-wrap justify-end gap-1">{r.notes.map((n) => <span key={n} className="rounded-lg px-2 py-0.5 font-bold bg-les text-fg text-sm">{labels[n] ?? n}</span>)}</span>}
      </li>
    );
  }
  if (r.kind === "opdracht") {
    return <li className={line}><Box done={r.done} onClick={() => onTick(r.task)} label={`${r.task.title} ${r.done ? "gedaan" : "nog niet gedaan"}`} />{text(r.task.title, taskReference(r.task), r.done)}</li>;
  }
  if (r.kind === "opname") {
    const sub = r.done ? (r.task.reactedAt ? `ingestuurd · reactie ${r.task.reactionEmoji}`.trim() : "ingestuurd") : taskReference(r.task);
    const inner = <><span aria-hidden="true" className="w-6 text-center text-xl shrink-0">🎙️</span>{text(`${r.task.title} opnemen`, sub)}{r.done ? <Box done /> : mayRecord && <span aria-hidden="true" className="text-muted text-xl">›</span>}</>;
    return mayRecord && !r.done && onRecord
      ? <li className={line}><button type="button" onClick={() => onRecord(r.task)} className="flex items-center gap-3 flex-1 min-w-0 text-left bg-transparent cursor-pointer p-0">{inner}</button></li>
      : <li className={line}>{inner}</li>;
  }
  return <li className={line}><span aria-hidden="true" className="w-6 text-center text-xl shrink-0">🎵</span>{text(r.title, r.task ? taskReference(r.task) : r.detail)}</li>;
}

/** bladmuziek, voorbeeld, opmerking en reacties staan op de huiswerkkaarten; tot een taak een eigen pagina krijgt (PR 5) */
function HeleHuiswerk({ items, instrumentId, mayRecord, onRecord }: { items: CurrentHomework[]; instrumentId: string; mayRecord: boolean; onRecord?(t: HomeworkTask): void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="self-start text-left text-sm font-semibold text-kent bg-transparent cursor-pointer p-0">
        {open ? "Minder tonen" : "Bladmuziek, voorbeelden en opmerkingen →"}
      </button>
      {open && items.map((x) => <HuiswerkKaart key={x.h.id} item={x} instrumentId={instrumentId} pupil mayRecord={mayRecord} onRecord={onRecord} />)}
    </div>
  );
}
