import { useState } from "react";
import { getInstrument } from "@notenkraker/instruments";
import { dateKey } from "@notenkraker/client";
import { client, hasBackend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { KindUitnodigen } from "@/components/KindUitnodigen";
import { Chip } from "@/components/ui";
import { HuiswerkKaart, useNoteLabels } from "@/components/Huiswerk";
import { activityOf, ActivityRow, Avatar, Label, PracticeChart, SessionRow, StreakBadge, useChildRows } from "./Dashboard";

/**
 * Pagina van één kind of leerling voor de ouder of leraar: bovenaan het huiswerk (AC-113), dan oefentijd per dag, sessies vrij
 * oefenen, rondes van het notenspel en noten, elk in een eigen blok. Op een telefoon onder elkaar, op een
 * iPad in twee kolommen. Tik op een dag of sessie voor de dagpagina met de details.
 */
export function KindPagina({ studentId, onPractice, onOpenDay, onGiveHomework }: { studentId: string; onPractice(): void; onOpenDay(date: string): void; onGiveHomework(): void }) {
  const { profile, loadStudents } = useApp();
  const row = useChildRows()?.find((r) => r.student.id === studentId);
  const [invite, setInvite] = useState<string | null>(null);
  /** direct tonen wat je aanklikt; daarna komt het via loadStudents uit de database */
  const [consent, setConsent] = useState<boolean | null>(null);
  const labels = useNoteLabels(row?.student.instrumentId ?? "altsax");

  if (!row) return <p className="text-muted">Laden…</p>;
  const { student, summary: s } = row;
  const pct = (n: number) => `${(100 * n) / Math.max(s.notes.total, 1)}%`;
  const games = activityOf(row, false).filter((a) => a.kind === "spel").slice(0, 5);
  const isOuder = profile?.role === "ouder";
  const canGive = profile?.role === "ouder" || profile?.role === "leraar";
  const mine = row.homework.find((x) => x.h.givenBy === profile?.id);

  return (
    <div className="flex flex-col gap-4 min-w-0">
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={student.name} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-muted truncate">{getInstrument(student.instrumentId).name}{student.ageBand ? ` · ${student.ageBand === "18+" ? "18+" : student.ageBand} jaar` : ""} · {student.userId ? "logt zelf in ✓" : "nog geen eigen login"}</div>
            <StreakBadge summary={s} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip primary className="flex-1" onClick={onPractice}>Oefenen met {student.name}</Chip>
          {isOuder && hasBackend && !student.userId && (
            <Chip onClick={() => void client.students.inviteCode(student.id, "kind").then(setInvite)}>Laten inloggen</Chip>
          )}
        </div>
        {hasBackend && student.ownerId === profile?.id && student.ageBand !== "18+" && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={consent ?? !!student.recordingConsent} className="w-5 h-5 mt-0.5 accent-[var(--color-ok)] shrink-0"
              onChange={(e) => { const on = e.target.checked; setConsent(on); void client.students.setRecordingConsent(student.id, on).then(loadStudents).catch(() => setConsent(!on)); }} />
            <span>{student.name} mag opnames insturen
              <span className="block text-xs text-muted">Bij huiswerk waarin om een opname wordt gevraagd. Alleen {student.name}, jij en de leraren kunnen ze beluisteren; ze worden 4 weken na de einddatum verwijderd.</span></span>
          </label>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2 min-w-0">
        {row.homework.map((x) => (
          <HuiswerkKaart key={x.h.id} item={x} instrumentId={student.instrumentId} mine={x.h.givenBy === profile?.id} onEdit={onGiveHomework} />
        ))}
        {canGive && !mine && (
          <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3 min-w-0">
            <Label>{row.homework.length ? "Eigen huiswerk" : "Nog geen huiswerk"}</Label>
            <p className="text-sm text-muted m-0">Geef {student.name} noten om te oefenen en een doel per dag. {student.name} ziet het bij het oefenen.</p>
            <Chip primary className="self-start" onClick={onGiveHomework}>Huiswerk geven</Chip>
          </section>
        )}

        <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2 min-w-0">
          <div className="flex justify-between gap-2"><Label>Oefentijd</Label><span className="text-xs text-muted">deze week {s.week.minutes} min</span></div>
          <PracticeChart summary={s} onOpenDay={onOpenDay} />
        </section>

        <section className="rounded-3xl bg-surface p-4 flex flex-col gap-1 min-w-0">
          <Label>Vrij oefenen</Label>
          {s.sessions.length === 0 && <p className="text-sm text-muted m-0 mt-1">Nog geen sessies.</p>}
          {s.sessions.map((p) => <SessionRow key={p.id} session={p} onOpen={() => onOpenDay(dateKey(new Date(p.startedAt)))} />)}
        </section>

        <section className="rounded-3xl bg-surface p-4 flex flex-col gap-1 min-w-0">
          <Label>Notenspel</Label>
          {games.length === 0 && <p className="text-sm text-muted m-0 mt-1">Nog geen notenspel gespeeld.</p>}
          {games.map((a) => <ActivityRow key={a.id} item={a} onOpen={() => onOpenDay(dateKey(new Date(a.at)))} />)}
        </section>

        <section className="rounded-3xl bg-surface p-4 flex flex-col gap-4 min-w-0">
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
              <div className="flex flex-wrap gap-1.5 mt-2">{s.lesNotes.map((n) => <span key={n} className="rounded-xl px-2.5 py-1 font-bold bg-les text-fg">{labels[n] ?? n}</span>)}</div>
            </div>
          )}
          <div>
            <Label>Nog lastig</Label>
            {s.weak.length ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {s.weak.map((w) => <span key={w.noteId} className="rounded-xl px-2.5 py-1 font-bold border-2 border-wrong text-wrong">{labels[w.noteId] ?? w.noteId} <small className="font-medium">{w.wrong}× fout</small></span>)}
              </div>
            ) : <p className="text-sm text-muted m-0 mt-1">{s.week.rounds ? "Niets: deze week alles goed 👏" : "Deze week nog geen notenspel gespeeld."}</p>}
          </div>
        </section>
      </div>

      {invite && <KindUitnodigen name={student.name} code={invite} onClose={() => setInvite(null)} />}
    </div>
  );
}
