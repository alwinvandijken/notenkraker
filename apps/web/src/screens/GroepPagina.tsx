import { useEffect, useState } from "react";
import clsx from "clsx";
import { dateKey, isRunning, lessonOverview, type GroupLesson, type Holiday, type LessonGroup } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip, Segmented, Week } from "@/components/ui";
import { useChildRows } from "@/screens/Dashboard";
import { DAGEN, kort, roosterTekst } from "@/screens/Groepen";

/**
 * De pagina van een lesgroep (AC-124 stap 2): deze en volgende les met per leerling wie klaar is, het
 * lessenoverzicht, en de groep zelf (leden, naam, rooster, opheffen).
 */
export type GroepTab = "deze" | "volgende" | "lessen" | "groep";
const TABS: Array<[GroepTab, string]> = [["deze", "Deze les"], ["volgende", "Volgende les"], ["lessen", "Lessen"], ["groep", "Groep"]];

export function useGroup(groupId: string): [LessonGroup | null, Holiday[], () => void] {
  const [group, setGroup] = useState<LessonGroup | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    void Promise.all([client.groups.get(groupId), client.groups.holidays()]).then(([g, h]) => { setGroup(g); setHolidays(h); });
  }, [groupId, version]);
  return [group, holidays, () => setVersion((v) => v + 1)];
}

export function GroepPagina({ groupId, tab, onTab, onGive, onOpenTask, onOpenLesson, onEnded, onTitle }: {
  groupId: string; tab: GroepTab; onTab(t: GroepTab): void; onGive(): void;
  onOpenTask(studentId: string, assignmentId: string, lessonId: string): void; onOpenLesson(date: string): void; onEnded(): void; onTitle(name: string): void;
}) {
  const [group, holidays, reload] = useGroup(groupId);
  const rows = useChildRows();
  useEffect(() => { if (group) onTitle(group.displayName); }, [group, onTitle]);
  if (!group) return <p className="text-muted">Laden…</p>;
  const today = dateKey(new Date());
  const leden = group.members.filter((m) => !m.leftOn);
  const deze = group.lessons.find((l) => isRunning(l) && l.date <= today && l.endDate >= today);
  const volgende = [...group.lessons].reverse().find((l) => isRunning(l) && l.date > today);
  const minuten = (sid: string) => rows?.find((r) => r.student.id === sid)?.summary.week.minutes ?? 0;

  const lesBlok = (l: GroupLesson | undefined, leeg: string) => (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <section aria-label="Huiswerk" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">{l ? `Les ${kort(l.date)} · huiswerk tot ${kort(l.endDate)}` : leeg}</span>
        {l?.items.map((it) => (
          <div key={it.homeworkItemId} className="flex items-center gap-3 rounded-2xl border-2 border-line p-3">
            <span className="flex-1 min-w-0"><b>{it.title}</b>{it.week > 1 && <> <Week n={it.week} /></>}
              {it.recording && <span className="block text-sm text-muted">🎙️ {Object.keys(it.recordingsBy).length} van {leden.length} opgenomen</span>}</span>
            <span role="group" aria-label={`Wie is klaar met ${it.title}`} className="flex gap-1">
              {leden.map((m) => {
                const klaar = it.doneBy.includes(m.studentId) || (it.recording && (it.recordingsBy[m.studentId] ?? 0) > 0);
                return (
                  <button key={m.studentId} type="button" aria-label={`${m.name}: ${klaar ? "klaar" : "nog niet"}`} onClick={() => onOpenTask(m.studentId, it.assignmentId, l.id)}
                    className={clsx("w-7 h-7 rounded-full grid place-items-center cursor-pointer border-2", klaar ? "bg-ok border-ok text-white" : "bg-surface border-dashed border-line text-muted")}>
                    <span aria-hidden="true" className="text-xs font-bold">{m.name.slice(0, 1)}</span>
                  </button>
                );
              })}
            </span>
          </div>
        ))}
        <Chip primary onClick={onGive}>Huiswerk geven</Chip>
      </section>
      <section aria-label="Deze week geoefend" className="rounded-3xl bg-surface p-4 flex flex-col gap-1">
        <span className="text-sm text-muted">Deze week geoefend</span>
        {leden.map((m) => <div key={m.studentId} className="flex"><span className="flex-1">{m.name}</span><b>{minuten(m.studentId)} min</b></div>)}
      </section>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted m-0">{roosterTekst(group.schedule)} · {leden.map((m) => m.name).join(", ")}</p>
      <div><Segmented value={tab} onChange={onTab} label="Tabbladen" options={TABS} /></div>
      {tab === "deze" && lesBlok(deze, "Nog geen huiswerk voor deze les.")}
      {tab === "volgende" && lesBlok(volgende, "Nog niets klaargezet voor de volgende les.")}
      {tab === "lessen" && (
        <ul aria-label="Lessen" className="list-none m-0 p-0 rounded-3xl bg-surface p-2 flex flex-col">
          {lessonOverview(group.lessons, group.schedule, holidays, today).map((r) => {
            const kan = r.date >= today && (r.status === "gepland" || r.status === "afgezegd");
            const tekst = <><b>{kort(r.date)}</b>{r.time ? ` ${r.time}` : ""}{r.label && <span className="block text-sm text-muted">{r.label}</span>}
              {r.lesson && r.lesson.items.length > 0 && <span className="block text-sm text-muted">{r.lesson.items.length} opdrachten</span>}</>;
            const badge = <span className={clsx("text-xs font-bold rounded-full px-2 py-0.5", r.status === "gegeven" ? "bg-ok/15 text-ok" : r.status === "gepland" ? "bg-accent-soft" : "bg-les/40")}>{r.status}</span>;
            return (
              <li key={r.date} className="border-b border-line last:border-0">
                {kan
                  ? <button type="button" onClick={() => onOpenLesson(r.date)} className="w-full flex items-center gap-3 p-3 text-left bg-transparent cursor-pointer"><span className="flex-1">{tekst}</span>{badge}<span aria-hidden="true">›</span></button>
                  : <div className="flex items-center gap-3 p-3"><span className="flex-1">{tekst}</span>{badge}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {tab === "groep" && <GroepBeheer group={group} onChanged={reload} onEnded={onEnded} />}
    </div>
  );
}

function GroepBeheer({ group, onChanged, onEnded }: { group: LessonGroup; onChanged(): void; onEnded(): void }) {
  const { students } = useApp();
  const [name, setName] = useState(group.name);
  const [weekday, setWeekday] = useState(group.schedule.weekday === null ? "" : String(group.schedule.weekday));
  const [time, setTime] = useState(group.schedule.startTime ?? "");
  const [sure, setSure] = useState(false);
  const leden = group.members.filter((m) => !m.leftOn);
  const anderen = students.filter((s) => !leden.some((m) => m.studentId === s.id));
  const run = (p: Promise<unknown>) => void p.then(onChanged);
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <section aria-label="Leden" className="rounded-3xl bg-surface p-4 flex flex-col gap-1">
        <span className="text-sm text-muted">Leerlingen</span>
        {leden.map((m) => (
          <div key={m.studentId} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span className="flex-1">{m.name} <span className="text-sm text-muted">sinds {kort(m.joinedOn)}</span></span>
            {/* een privéles blijft van één leerling */}
            {group.name && <button type="button" aria-label={`${m.name} uit de groep`} onClick={() => run(client.groups.removeMember(group.id, m.studentId))} className="bg-transparent cursor-pointer text-muted px-2">✕</button>}
          </div>
        ))}
        {group.name && anderen.length > 0 && (
          <label className="flex items-center gap-2 mt-2"><span className="text-sm text-muted">Toevoegen</span>
            <select aria-label="Leerling toevoegen" value="" onChange={(e) => e.target.value && run(client.groups.addMember(group.id, e.target.value))} className="rounded-xl border-2 border-line px-2 py-1.5 ml-auto">
              <option value="">kies…</option>{anderen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
        )}
        {group.name && <span className="text-xs text-muted">Haal je iemand uit de groep, dan ziet hij vanaf vandaag geen nieuw groepshuiswerk meer. Zijn opnames en vinkjes blijven.</span>}
      </section>
      {group.name && (
        <section className="rounded-3xl bg-surface p-4 flex gap-2 items-end">
          <label className="flex-1 flex flex-col gap-1"><span className="text-sm text-muted">Naam</span>
            <input aria-label="Naam van de groep" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" /></label>
          <Chip disabled={!name.trim() || name === group.name} onClick={() => run(client.groups.rename(group.id, name.trim()))}>Opslaan</Chip>
        </section>
      )}
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Rooster</span>
        <Segmented value={weekday} onChange={setWeekday} label="Lesdag" options={DAGEN} />
        <label className="flex items-center gap-2"><span className="text-sm text-muted">Begintijd</span>
          <input type="time" aria-label="Begintijd" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5 ml-auto" /></label>
        <span className="text-xs text-muted">Een nieuwe dag geldt vanaf de volgende les; eerdere lessen blijven staan.</span>
        <Chip onClick={() => run(client.groups.setSchedule(group.id, { weekday: weekday === "" ? null : Number(weekday), startTime: time || null }))}>Rooster opslaan</Chip>
      </section>
      {group.name && (sure
        ? <Chip onClick={() => void client.groups.end(group.id).then(onEnded)}>Ja, groep opheffen</Chip>
        : <button type="button" onClick={() => setSure(true)} className="self-start bg-transparent text-accent font-semibold cursor-pointer">Groep opheffen</button>)}
    </div>
  );
}

export function LesBeheer({ groupId, date, onDone }: { groupId: string; date: string; onDone(): void }) {
  const [group] = useGroup(groupId);
  const [newDate, setNewDate] = useState(date);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (group) setTime(group.lessons.find((l) => l.date === date)?.startTime ?? group.schedule.startTime ?? ""); }, [group, date]);
  const doe = (p: Promise<void>) => { setError(null); void p.then(onDone).catch(() => setError("Dat lukte niet. Staat er op die dag al een les, of ligt hij in het verleden?")); };
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <section aria-label="Verzetten" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Verzetten</span>
        <label className="flex items-center gap-2"><span className="flex-1">Datum</span><input type="date" aria-label="Nieuwe datum" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5" /></label>
        <label className="flex items-center gap-2"><span className="flex-1">Tijd</span><input type="time" aria-label="Nieuwe tijd" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5" /></label>
        <span className="text-xs text-muted">Alleen deze les; het rooster blijft zoals het is.</span>
        <Chip primary disabled={newDate === date} onClick={() => doe(client.groups.moveLesson(groupId, date, newDate, time || null))}>Verzetten</Chip>
      </section>
      <section aria-label="Afzeggen" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Afzeggen</span>
        <input aria-label="Reden" value={reason} onChange={(e) => setReason(e.target.value)} placeholder='Reden (mag leeg), bijv. "leraar ziek"' className="rounded-xl border-2 border-line px-3 py-2" />
        <span className="text-xs text-muted">Het huiswerk van de vorige les loopt door tot de les erna. Wat je al klaarzette, schuift mee.</span>
        <Chip onClick={() => doe(client.groups.cancelLesson(groupId, date, reason.trim()))}>Les afzeggen</Chip>
      </section>
      {error && <p className="text-sm text-accent m-0">{error}</p>}
    </div>
  );
}
