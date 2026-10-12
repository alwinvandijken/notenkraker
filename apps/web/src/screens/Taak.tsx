import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { currentHomework, dueLabel, taskReference, type Homework, type HomeworkTask, type TaskRecording } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { MAX_SECONDS, pickAudioType, timeLabel } from "@/lib/opname";
import { GiverAvatar, mayRecord as mayRecordFor } from "@/components/Huiswerk";
import { OpnameLijst, openSheet, Play } from "@/components/Opdrachten";
import { Chip, Week } from "@/components/ui";

/**
 * Een taak openen (AC-120 PR 5, mock-up docs/ux-review/vandaag.html "Een taak"): één pagina met alles
 * voor die taak. Links wat je moet spelen (bladmuziek, voorbeeld, de opmerking van wie het gaf),
 * rechts het opnemen en je opnames met de reactie per opname. Je kunt een stuk vaker opnemen,
 * bijvoorbeeld aan het begin en aan het eind van de week (AC-121).
 */
/** `lessonId`: de les waaruit de taak geopend werd; een opdracht die meeging staat in meer lessen (AC-124) */
export function Taak({ studentId, taskId, lessonId }: { studentId: string; taskId: string; lessonId?: string }) {
  const { students } = useApp();
  const student = students.find((s) => s.id === studentId);
  const [found, setFound] = useState<{ h: Homework; t: HomeworkTask } | null | undefined>(undefined);

  const load = useCallback(() => client.homework.list(studentId).then((list) => {
    // de les waaruit je kwam; anders de lopende les; anders de nieuwste waarin de opdracht staat
    const order = [...list.filter((h) => h.id === lessonId), ...currentHomework(list), ...list];
    for (const h of order) { const t = h.tasks.find((x) => x.id === taskId); if (t) return setFound({ h, t }); }
    setFound(null);
  }).catch(() => setFound(null)), [studentId, taskId, lessonId]);
  useEffect(() => { void load(); }, [load]);

  if (found === undefined) return <p className="text-muted">Laden…</p>;
  if (!found || !student) return <p className="text-wrong">Deze opdracht bestaat niet meer.</p>;
  const { h, t } = found;
  const mayRecord = mayRecordFor(student);

  const remove = async (r: TaskRecording) => {
    const path = await client.homework.deleteRecording(r.id);
    if (path) await client.files.removeRecording(path).catch(() => {});
    await load();
  };

  return (
    <div className={clsx("grid gap-4 items-start", t.recording && "lg:grid-cols-2")}>
      <section aria-label="Wat je speelt" className="rounded-3xl bg-surface p-5 flex flex-col gap-4 min-w-0">
        <div>
          <h1 className="font-display font-extrabold text-3xl leading-tight m-0">{t.title}</h1>
          {t.week > 1 && <div className="mt-1"><Week n={t.week} /></div>}
          <p className="text-muted m-0 mt-1">{[taskReference(t), `tot ${dueLabel(h.dueDate)}`].filter(Boolean).join(" · ")}</p>
        </div>
        {(t.sheetPath || t.examplePath) && (
          <div className="flex flex-wrap gap-2">
            {t.sheetPath && <Chip onClick={() => openSheet(t.sheetPath!)}>📄 Bladmuziek</Chip>}
            {t.examplePath && <Play bucket="bladmuziek" path={t.examplePath} label={`Voorbeeld van ${h.givenByName}`} />}
          </div>
        )}
        {h.remark && (
          <div className="flex items-start gap-2.5 rounded-2xl bg-bg p-3">
            <GiverAvatar h={h} small />
            <span className="text-sm whitespace-pre-line"><b>{h.givenByName}:</b> “{h.remark}”</span>
          </div>
        )}
        {t.kind === "opdracht" && <Afvinken task={t} studentId={studentId} />}
      </section>

      {t.recording && (
        <section aria-label="Opnemen" className="flex flex-col gap-4 min-w-0">
          {mayRecord
            ? <Recorder studentId={studentId} task={t} onSent={load} />
            : <p className="rounded-3xl bg-surface p-5 m-0 text-muted">Vraag je ouder om opnames toe te staan (op jouw pagina bij je ouder).</p>}
          <div className="rounded-3xl bg-surface p-5 flex flex-col gap-3">
            <h2 className="font-display font-bold text-xl m-0">Jouw opnames</h2>
            <OpnameLijst recordings={t.recordings} viewer="pupil" dueDate={h.dueDate} weeks={t.weeks} onDelete={(r) => void remove(r)} />
          </div>
        </section>
      )}
    </div>
  );
}

function Afvinken({ task, studentId }: { task: HomeworkTask; studentId: string }) {
  const [done, setDone] = useState(!!task.doneAt);
  const tick = async () => {
    const next = !done; setDone(next);
    try { await client.homework.setTaskDone(task.homeworkItemId, studentId, next); } catch { setDone(!next); }
  };
  return (
    <button type="button" aria-pressed={done} onClick={() => void tick()}
      className={clsx("self-start flex items-center gap-3 rounded-full border-2 px-5 py-3 font-display font-semibold cursor-pointer", done ? "border-ok bg-ok text-white" : "border-line bg-surface")}>
      <span aria-hidden="true">{done ? "✓" : "○"}</span>{done ? "Gedaan" : "Afvinken als gedaan"}
    </button>
  );
}

type Fase = "klaar" | "opnemen" | "luisteren" | "insturen";

/** grote rode knop, de tijd loopt mee (hooguit 5 minuten), daarna terugluisteren en insturen of opnieuw */
function Recorder({ studentId, task, onSent }: { studentId: string; task: HomeworkTask; onSent(): Promise<void> }) {
  const [fase, setFase] = useState<Fase>("klaar");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const type = useRef(pickAudioType((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)));
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => { if (!blob) { setUrl(null); return; } const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  useEffect(() => () => stopAll(), []);

  function stopAll() {
    if (timer.current) window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }

  const start = async () => {
    setError(""); setSent(false);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("De app mag de microfoon niet gebruiken. Sta de microfoon toe in je browser en probeer opnieuw.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current, type.current.mimeType ? { mimeType: type.current.mimeType } : undefined);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => { stopAll(); setBlob(new Blob(chunks, { type: rec.mimeType || "audio/webm" })); setFase("luisteren"); };
    recorder.current = rec;
    rec.start(1000);
    setSeconds(0); setFase("opnemen");
    const began = Date.now();
    timer.current = window.setInterval(() => {
      const s = (Date.now() - began) / 1000;
      setSeconds(s);
      if (s >= MAX_SECONDS) rec.state !== "inactive" && rec.stop();
    }, 250);
  };
  const stop = () => { if (recorder.current?.state !== "inactive") recorder.current?.stop(); };

  // een nieuwe opname komt erbij; de vorige blijven staan (AC-121)
  const send = async () => {
    if (!blob) return;
    setFase("insturen"); setError("");
    try {
      const path = await client.files.uploadRecording(studentId, task.id, blob, type.current.ext);
      await client.homework.submitRecording(task.id, studentId, path, seconds);
      await onSent();
      setBlob(null); setSeconds(0); setFase("klaar"); setSent(true);
    } catch {
      setFase("luisteren"); setError("Insturen lukte niet. Probeer het nog een keer.");
    }
  };

  return (
    <div className="rounded-3xl bg-surface p-6 flex flex-col items-center gap-4 text-center">
      {(fase === "klaar" || fase === "opnemen") && (
        <>
          <div className="font-display font-bold text-4xl" aria-live="polite">{timeLabel(seconds)}</div>
          <button type="button" onClick={() => void (fase === "opnemen" ? stop() : start())}
            aria-label={fase === "opnemen" ? "Stop met opnemen" : "Begin met opnemen"}
            className="w-24 h-24 rounded-full bg-wrong text-white text-3xl flex items-center justify-center cursor-pointer"
            style={{ boxShadow: `0 0 0 ${fase === "opnemen" ? 14 : 8}px color-mix(in srgb, var(--color-wrong) 18%, transparent)` }}>
            {fase === "opnemen" ? "■" : "●"}
          </button>
          <p className="text-sm text-muted m-0">
            {sent ? "Ingestuurd! ✓ Telt mee als oefentijd. Je kunt het later in de week nog een keer opnemen." : fase === "opnemen" ? "Tik om te stoppen" : `Tik en speel · hooguit ${MAX_SECONDS / 60} minuten`}
          </p>
        </>
      )}
      {(fase === "luisteren" || fase === "insturen") && url && (
        <div className="w-full flex flex-col gap-3">
          <audio controls src={url} className="w-full" />
          <p className="text-sm text-muted m-0">{timeLabel(seconds)} opgenomen. Klinkt het goed?</p>
          <Chip primary disabled={fase === "insturen"} onClick={() => void send()} className="py-3 text-lg">{fase === "insturen" ? "Insturen…" : "Insturen"}</Chip>
          <Chip disabled={fase === "insturen"} onClick={() => { setBlob(null); setSeconds(0); setFase("klaar"); }}>Opnieuw opnemen</Chip>
        </div>
      )}
      {error && <p className="text-sm text-wrong m-0">{error}</p>}
    </div>
  );
}
