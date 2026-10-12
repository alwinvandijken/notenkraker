import { useEffect, useRef, useState } from "react";
import { taskReference, type HomeworkTask } from "@notenkraker/client";
import { client } from "@/lib/client";
import { MAX_SECONDS, pickAudioType, timeLabel } from "@/lib/opname";
import { Chip } from "@/components/ui";

/**
 * Opnemen (AC-118 stap 1b, mock-up docs/mockups/Huiswerk-Opdrachten.html stap 3 en 4), een eigen
 * pagina: grote rode knop, de tijd loopt mee (hooguit 5 minuten), daarna terugluisteren en insturen
 * of opnieuw. Alleen de ingestuurde opname komt bij leraar en ouder; een nieuwe vervangt de vorige.
 */
type Fase = "laden" | "klaar" | "opnemen" | "luisteren" | "insturen" | "fout";

export function Opnemen({ studentId, taskId, onDone }: { studentId: string; taskId: string; onDone(): void }) {
  const [task, setTask] = useState<HomeworkTask | null>(null);
  const [fase, setFase] = useState<Fase>("laden");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const type = useRef(pickAudioType((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)));
  const url = blob ? URL.createObjectURL(blob) : null;

  useEffect(() => {
    void client.homework.list(studentId).then((list) => {
      const t = list.flatMap((h) => h.tasks).find((x) => x.id === taskId) ?? null;
      setTask(t); setFase(t ? "klaar" : "fout"); if (!t) setError("Deze opdracht bestaat niet meer.");
    }).catch(() => { setFase("fout"); setError("Laden lukte niet."); });
    return () => stopAll();
  }, [studentId, taskId]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function stopAll() {
    if (timer.current) window.clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
  }

  const start = async () => {
    setError("");
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

  const send = async () => {
    if (!blob || !task) return;
    setFase("insturen"); setError("");
    try {
      const path = await client.files.uploadRecording(studentId, task.id, blob, type.current.ext);
      await client.homework.submitRecording(task.id, path);
      // de vorige opname is niet meer nodig
      if (task.recordingPath && task.recordingPath !== path) await client.files.removeRecording(task.recordingPath).catch(() => {});
      onDone();
    } catch {
      setFase("luisteren"); setError("Insturen lukte niet. Probeer het nog een keer.");
    }
  };

  if (fase === "laden") return <p className="text-muted">Laden…</p>;
  if (!task) return <p className="text-wrong">{error}</p>;
  return (
    <div className="flex flex-col gap-5 max-w-[520px] items-stretch text-center">
      <div>
        <h2 className="font-display font-bold text-2xl m-0">{task.title}</h2>
        {taskReference(task) && <p className="text-sm text-muted m-0 mt-1">📖 {taskReference(task)}</p>}
      </div>

      {(fase === "klaar" || fase === "opnemen") && (
        <div className="rounded-3xl bg-surface p-6 flex flex-col items-center gap-4">
          <div className="font-display font-bold text-4xl" aria-live="polite">{timeLabel(seconds)}</div>
          <button type="button" onClick={() => void (fase === "opnemen" ? stop() : start())}
            aria-label={fase === "opnemen" ? "Stop met opnemen" : "Begin met opnemen"}
            className="w-24 h-24 rounded-full bg-wrong text-white text-3xl flex items-center justify-center cursor-pointer"
            style={{ boxShadow: `0 0 0 ${fase === "opnemen" ? 14 : 8}px color-mix(in srgb, var(--color-wrong) 18%, transparent)` }}>
            {fase === "opnemen" ? "■" : "●"}
          </button>
          <p className="text-sm text-muted m-0">{fase === "opnemen" ? "Tik om te stoppen" : "Tik op de rode knop en speel het stuk"} · hooguit {MAX_SECONDS / 60} minuten</p>
        </div>
      )}

      {(fase === "luisteren" || fase === "insturen") && url && (
        <div className="rounded-3xl bg-surface p-5 flex flex-col gap-3">
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
