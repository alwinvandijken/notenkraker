import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ageProfile, midiToPitch, PracticeTracker, soundingMidi, toId, type NoteId, type PracticeState, type PracticeSummary } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import type { PracticeSession } from "@notenkraker/client";
import { MicListener } from "@/audio/mic";
import { client, isAnonymous } from "@/lib/client";
import { loadToday } from "@/lib/vandaagData";
import { gainLabel } from "@/lib/spelen";
import { useApp } from "@/lib/store";
import { noteLabel } from "@/lib/noten";
import { Chip } from "@/components/ui";
import { Focus } from "@/components/Focus";
import { Donut } from "@/components/Donut";
import { StaffRow } from "@/components/Staff";

/**
 * Vrij oefenen met de oefentimer (AC-112, mock-up: docs/mockups/Oefentimer.html).
 * De server legt start en einde vast; daartussen luistert de app en telt alleen de tijd
 * waarin het instrument klinkt. Elke halve minuut gaat de stand naar de server, zodat een
 * sessie ook telt als de app wegvalt. Er wordt geen geluid opgeslagen.
 *
 * AC-120 (mock-up docs/ux-review/vandaag.html, Vrij spelen): klaarzetten met één knop (de uitleg over
 * de microfoon alleen de eerste keer), spelen in focus met de tijd groot, een meter en "Klaar", en
 * daarna het resultaat met wat het oplevert voor vandaag.
 */
const SYNC_MS = 30_000;
const MIC_OK = "nk.mic-ok";

type Phase = "klaar" | "bezig" | "samenvatting";

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** `after`: extra blok onder de samenvatting, bijv. de uitnodiging voor een account (zonder account); `onDone`: naar Vandaag */
export function VrijOefenen({ after, onDone }: { after?: React.ReactNode; onDone?(): void } = {}) {
  const { students, studentId } = useApp();
  const student = students.find((s) => s.id === studentId);
  const instrument = getInstrument(student?.instrumentId ?? "altsax");
  const range = instrument.range;
  const written = (midi: number): NoteId => toId(midiToPitch(midi - instrument.transposition));

  const [phase, setPhase] = useState<Phase>("klaar");
  /** de uitleg over de microfoon alleen de eerste keer */
  const [firstTime] = useState(() => !localStorage.getItem(MIC_OK));
  const before = useRef<Promise<number> | null>(null);
  const [gain, setGain] = useState<string | null>(null);
  const todayFor = (id: string) => loadToday(id, { withHomework: !isAnonymous, dailyGoal: ageProfile(student?.ageBand).dailyGoal });
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => performance.now());
  const [summary, setSummary] = useState<{ local: PracticeSummary; saved: PracticeSession | null; sequence: number[] } | null>(null);
  const run = useRef<{ tracker: PracticeTracker; mic: MicListener; session: PracticeSession; startMs: number; unsub: () => void } | null>(null);

  /** wat er nu naar de server gaat: per minuut seconden en geschreven noten */
  function payload(s: PracticeSummary) {
    return {
      minutes: s.minutes.map((m) => ({ s: Math.min(60, m.s), notes: m.notes.map(written) })),
      notes: s.notes.map(written),
    };
  }

  async function start() {
    if (!student) return;
    setError("");
    const mic = new MicListener();
    if (!(await mic.start())) { setError("Ik kan de microfoon niet gebruiken. Geef toestemming in de instellingen van je browser."); return; }
    localStorage.setItem(MIC_OK, "1");
    let session: PracticeSession;
    try { session = await client.practice.start(student.id); } catch (e) {
      mic.stop(); setError(e instanceof Error ? e.message : "Starten lukte niet."); return;
    }
    before.current = todayFor(student.id).then((d) => d.today).catch(() => 0);
    setGain(null);
    const startMs = performance.now();
    const tracker = new PracticeTracker({
      minMidi: soundingMidi(range[0], instrument.transposition) - 1,
      maxMidi: soundingMidi(range[1], instrument.transposition) + 1,
      startMs,
    });
    const unsub = mic.onReading((r) => tracker.push(r, performance.now()));
    run.current = { tracker, mic, session, startMs, unsub };
    setPhase("bezig");
  }

  async function sync(done: boolean) {
    const r = run.current;
    if (!r) return null;
    try { return await client.practice.update(r.session.id, { ...payload(r.tracker.summary(performance.now())), done }); }
    catch { return null; /* volgende keer opnieuw; de server houdt de laatste stand */ }
  }

  async function finish() {
    const r = run.current;
    if (!r) return;
    const local = r.tracker.summary(performance.now());
    const sequence = r.tracker.sequence().map((n) => n.midi);
    r.unsub(); r.mic.stop();
    const saved = await sync(true);
    run.current = null;
    setSummary({ local, saved, sequence });
    setPhase("samenvatting");
    if (saved && student) {
      const [was, now] = await Promise.all([before.current ?? Promise.resolve(0), todayFor(student.id).catch(() => null)]);
      if (now) setGain(gainLabel(now.today - was, now.goal - now.today));
    }
  }

  // tijdens het oefenen: scherm aan, teller verversen, elke halve minuut naar de server
  useEffect(() => {
    if (phase !== "bezig") return;
    let lock: { release(): Promise<void> } | null = null;
    const wake = () => { void (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<typeof lock> } }).wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    wake();
    const tick = setInterval(() => setNow(performance.now()), 250);
    const save = setInterval(() => void sync(false), SYNC_MS);
    // de app gaat naar de achtergrond: stand opslaan; terug: microfoon en schermlock opnieuw
    const onVisible = () => {
      if (document.visibilityState === "hidden") void sync(false);
      else { void run.current?.mic.start(); wake(); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick); clearInterval(save);
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // weg van dit scherm terwijl de timer loopt: netjes afsluiten
  useEffect(() => () => {
    const r = run.current;
    if (!r) return;
    r.unsub(); r.mic.stop();
    void client.practice.update(r.session.id, { ...payload(r.tracker.summary(performance.now())), done: true }).catch(() => {});
    run.current = null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!student) return null;

  // klaarzetten: één knop; de uitleg alleen de eerste keer
  if (phase === "klaar") {
    const sax = instrument.name.toLowerCase();
    return (
      <div className="flex flex-col items-center text-center gap-4 py-6 max-w-[520px] mx-auto">
        <div className="w-24 h-24 rounded-full bg-accent-soft flex items-center justify-center text-5xl" aria-hidden="true">🎙️</div>
        <h2 className="font-display font-bold text-3xl m-0">Speel wat je wilt</h2>
        <p className="text-muted m-0 leading-relaxed">
          {firstTime
            ? `Ik tel alleen de tijd waarin ik je ${sax} hoor. Praten en stilte tellen niet mee. Ik neem niets op en stuur geen geluid weg; je ouder en leraar zien hoe lang je speelde en welke noten.`
            : `Pak je ${sax} en speel. Ik tel mee hoe lang ik je hoor.`}
        </p>
        <Chip primary className="text-xl px-12 py-4" onClick={() => void start()}>Begin</Chip>
        {error && <p className="text-sm text-wrong m-0">{error}</p>}
      </div>
    );
  }

  if (phase === "samenvatting" && summary) {
    const playedSec = summary.saved?.playedSeconds ?? Math.round(summary.local.playedMs / 1000);
    const totalSec = summary.saved ? (Date.parse(summary.saved.endedAt) - Date.parse(summary.saved.startedAt)) / 1000 : summary.local.elapsedMs / 1000;
    const percent = totalSec ? Math.min(100, Math.round((100 * playedSec) / totalSec)) : 0;
    const notes = summary.saved?.notes ?? summary.local.notes.map(written);
    return (
      <Focus label="Vrij spelen">
        <div className="flex-1 flex flex-col items-center gap-4 px-4 py-8 text-center w-full max-w-[640px] mx-auto">
          <h2 className="font-display font-bold text-3xl m-0">{playedSec >= 60 ? "Goed gedaan! 🎉" : "Klaar"}</h2>
          <Donut percent={percent} size={150} stroke={14}>
            <b className="font-display text-3xl">{clock(playedSec * 1000)}</b><span className="text-xs text-muted mt-1">van {clock(totalSec * 1000)}</span>
          </Donut>
          {gain && <div className="rounded-2xl bg-ok/15 text-ok font-semibold px-4 py-2">{gain}</div>}
          <div className="w-full rounded-2xl bg-surface p-4 flex flex-col gap-2 text-left">
            <div className="flex justify-between text-sm"><span>Gespeeld</span><b>{percent}% van de tijd</b></div>
            <div className="flex gap-1 h-6" aria-label="Per minuut: gespeeld of niet">
              {summary.local.minutes.map((m, i) => (
                <i key={i} title={`minuut ${i + 1}: ${m.s} s`} className={clsx("flex-1 rounded", m.s >= 30 ? "bg-ok" : m.s > 0 ? "bg-ok/40" : "bg-line")} />
              ))}
            </div>
            {notes.length > 0 && <span className="text-sm text-muted">Noten: {notes.map((n) => noteLabel(n, range)).join(" · ")}</span>}
            {summary.sequence.length > 0 && (
              <>
                <span className="text-sm text-muted mt-1">Zo speelde je (de laatste 200 noten, scroll voor meer)</span>
                <div className="text-fg">
                  <StaffRow clef={instrument.clef} naming={student.naming} height={170}
                    notes={summary.sequence.slice(-200).map((m) => ({ id: written(m), color: "var(--color-kent)", label: noteLabel(written(m), range) }))} />
                </div>
              </>
            )}
            {summary.saved?.label === "twijfel" && <span className="text-sm text-muted">Ik hoorde steeds dezelfde noot. Je ouder ziet dit als twijfelachtig.</span>}
            {!summary.saved && <span className="text-sm text-wrong">Opslaan lukte niet; de laatste tussenstand is wel bewaard.</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Chip primary className="text-lg px-8 py-3" onClick={() => { setSummary(null); setPhase("klaar"); void start(); }}>Nog een keer</Chip>
            <Chip className="text-lg px-8 py-3" onClick={() => { setSummary(null); setPhase("klaar"); onDone?.(); }}>{onDone ? "Naar Vandaag" : "Klaar"}</Chip>
          </div>
          {after}
        </div>
      </Focus>
    );
  }

  // spelen in focus: de tijd groot, een meter die laat zien dat de app je hoort, en Klaar
  const r = run.current;
  if (!r) return null;
  const s = r.tracker.summary(now);
  const state = r.tracker.state(now);
  const midi = r.tracker.currentMidi(now);
  return (
    <Focus label="Vrij spelen">
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-4 text-center w-full max-w-[640px] mx-auto">
        <div className={clsx("font-display font-extrabold text-8xl sm:text-9xl tabular-nums leading-none", state !== "playing" && "text-muted")} aria-live="off">{clock(s.playedMs)}</div>
        <div className="text-sm text-muted -mt-2">gespeeld · timer staat {clock(s.elapsedMs)} aan</div>
        <Status state={state} note={midi === null ? null : noteLabel(written(midi), range)} instrument={instrument.name.toLowerCase()} />
        {s.notes.length > 0 && (
          <div className="flex flex-wrap justify-center items-center gap-1.5">
            <span className="text-sm text-muted mr-1">Noten:</span>
            {s.notes.map((m) => <span key={m} className="rounded-lg px-2 py-0.5 font-bold bg-kent-soft">{noteLabel(written(m), range)}</span>)}
          </div>
        )}
      </div>
      {/* één grote knop onderaan: met een sax in je handen beter te raken dan een kleine linksboven */}
      <div className="px-4 pb-6 flex justify-center">
        <Chip primary className="text-xl px-16 py-4" onClick={() => void finish()}>Klaar</Chip>
      </div>
    </Focus>
  );
}

function Status({ state, note, instrument }: { state: PracticeState; note: string | null; instrument: string }) {
  const text = state === "playing" ? <>Ik hoor je {instrument}{note && <> · <b className="text-xl">{note}</b></>}</>
    : state === "noise" ? "Dit klinkt niet als je " + instrument + " · telt niet mee"
    : "Ik hoor niets · telt niet mee";
  return (
    <div role="status" className={clsx("w-full rounded-2xl px-4 py-3 font-semibold flex items-center justify-center gap-2",
      state === "playing" ? "bg-ok/15 text-ok" : state === "noise" ? "bg-wrong/10 text-wrong" : "bg-bg text-muted")}>
      <span className={clsx("w-2.5 h-2.5 rounded-full", state === "playing" ? "bg-ok animate-pulse" : state === "noise" ? "bg-wrong" : "bg-moet")} />
      <span>{text}</span>
    </div>
  );
}
