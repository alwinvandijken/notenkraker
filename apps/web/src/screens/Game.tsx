import { useEffect, useMemo, useRef, useState } from "react";
import { ageProfile, instrumentNotes, makeSequence, nextNewNote, noteLadder, midiToPitch, NoteMatcher, noteName, parseId, scoreRound, soundingMidi, toId, weightedPool, type NoteId, type PitchReading } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import type { Round } from "@notenkraker/client";
import { client, isAnonymous } from "@/lib/client";
import { loadToday } from "@/lib/vandaagData";
import { gainLabel, hardLabel, secondsLabel } from "@/lib/spelen";
import { useApp } from "@/lib/store";
import { StaffRow } from "@/components/Staff";
import { Chip, Segmented } from "@/components/ui";
import { Focus } from "@/components/Focus";
import { playMidi } from "@/audio/synth";
import { MicListener } from "@/audio/mic";

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(Math.floor(ms % 1000)).padStart(3, "0")}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Answer = { expected: NoteId; given: NoteId | null; correct: boolean };

/**
 * Spelen (AC-120 PR 3, mock-up docs/ux-review/vandaag.html): klaarzetten met één knop in het midden,
 * spelen in focus over het hele scherm (geen tabbalk, geen avatar, alleen levens, tijd, de noot en
 * grote knoppen) en een resultaat met wat de ronde oplevert voor vandaag.
 */
export function Game({ onDone }: { onDone?(): void }) {
  const { profile, students, studentId, statuses } = useApp();
  const student = students.find((s) => s.id === studentId);
  const instrument = getInstrument(student?.instrumentId ?? "altsax");
  const naming = student?.naming ?? "nl";
  const all = useMemo(() => instrumentNotes(instrument), [instrument]);
  const name = (id: NoteId) => noteName(parseId(id), naming);
  // rondelengte, levens en stopwatch per leeftijdsgroep (AC-115)
  const { roundLength: LENGTH, lives: LIVES, showTimer, dailyGoal } = ageProfile(student?.ageBand);
  const ladder = useMemo(() => noteLadder(instrument.range, instrument.starterNotes), [instrument]);
  // de noten die je kent of oefent, plus de eerstvolgende nieuwe noot
  const newNote = Object.keys(statuses).length ? nextNewNote(ladder, statuses) : null;

  const [input, setInput] = useState<"buttons" | "mic">(() => (localStorage.getItem("nk.input") as "buttons" | "mic") || "buttons");
  const [seq, setSeq] = useState<NoteId[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof scoreRound> | null>(null);
  const [history, setHistory] = useState<Round[]>([]);
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [micError, setMicError] = useState("");
  const t0 = useRef(0);
  const mic = useRef<MicListener | null>(null);
  const matcher = useRef(new NoteMatcher({ expectedMidi: 0 }));
  /** minuten van vandaag vóór de ronde, om te tonen wat hij oplevert */
  const before = useRef<Promise<number> | null>(null);
  const [gain, setGain] = useState<string | null>(null);
  const todayFor = (id: string) => loadToday(id, { withHomework: !isAnonymous, dailyGoal });

  const pool = useMemo(() => {
    const base = weightedPool(statuses, instrument.starterNotes.length ? instrument.starterNotes : all.slice(0, 5));
    return newNote ? [...base, newNote, newNote] : base;
  }, [statuses, instrument, all, newNote]);
  const names = useMemo(() => {
    // vaste volgorde: stamtonen vanaf c, daarna de kruizen/mollen
    const have = new Set(pool.map((n) => name(n)));
    const order = all.map((n) => name(n)).filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => { const base = (s: string) => "cdefgab".indexOf(s[0]!) + (parseId(all.find((n) => name(n) === s)!).accidental ? 7 : 0); return base(a) - base(b); });
    return order.filter((n) => have.has(n));
  }, [pool, all, naming]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = answers.length;
  const lives = LIVES - answers.filter((a) => !a.correct).length;

  useEffect(() => { if (studentId) client.rounds.recent(studentId).then(setHistory).catch(() => setHistory([])); }, [studentId, result]);
  useEffect(() => { if (!running) return; const id = setInterval(() => setElapsed(performance.now() - t0.current), 50); return () => clearInterval(id); }, [running]);

  // microfoon: koppel de matcher aan de huidige noot
  useEffect(() => {
    if (!running || input !== "mic" || pos >= seq.length) return;
    matcher.current.reset({ expectedMidi: soundingMidi(seq[pos]!, instrument.transposition) });
  }, [running, input, pos, seq, instrument.transposition]);

  useEffect(() => {
    if (input !== "mic" || !running) { mic.current?.stop(); return; }
    const m = (mic.current ??= new MicListener());
    const off = m.onReading((r) => {
      setReading(r);
      if (!running || pos >= seq.length) return;
      const ev = matcher.current.push(r, performance.now());
      if (ev?.type === "correct") answer(seq[pos]!);
      else if (ev?.type === "wrong") answer(toId(midiToPitch(ev.midi - instrument.transposition)));
    });
    m.start().then((ok) => { if (!ok) { setMicError("Microfoon niet beschikbaar. Geef toestemming of kies Knoppen."); setInput("buttons"); } });
    return () => { off(); };
  }, [input, running, pos, seq]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    if (studentId) before.current = todayFor(studentId).then((d) => d.today).catch(() => 0);
    setSeq(makeSequence(pool, LENGTH)); setAnswers([]); setResult(null); setGain(null); setMsg(""); setRunning(true); setMicError("");
    t0.current = performance.now(); setElapsed(0);
  }
  function quit() { setRunning(false); setSeq([]); setAnswers([]); setMsg(""); mic.current?.stop(); }

  function answer(given: NoteId) {
    if (!running || pos >= seq.length) return;
    const expected = seq[pos]!;
    // knoppen: alleen de naam telt (octaaf niet); microfoon: exacte toonhoogte
    const correct = input === "mic" ? given === expected : name(given) === name(expected);
    const next = [...answers, { expected, given, correct }];
    if (correct) { playMidi(soundingMidi(expected, instrument.transposition)); setMsg("Goed!"); } else setMsg(`Dat was een ${cap(name(expected))}`);
    setAnswers(next);
    const mistakes = next.filter((a) => !a.correct).length;
    if (mistakes >= LIVES || next.length >= seq.length) finish(next);
  }

  async function finish(final: Answer[]) {
    setRunning(false); mic.current?.stop();
    const ms = Math.round(performance.now() - t0.current);
    const local = scoreRound({ mode: input, lives: LIVES, ms, answers: final }, statuses);
    setResult(local); setElapsed(ms);
    if (!studentId) return;
    try {
      await client.rounds.submit({ studentId, mode: input, ms, answers: final });
      const [was, now] = await Promise.all([before.current ?? Promise.resolve(0), todayFor(studentId)]);
      setGain(gainLabel(now.today - was, now.goal - now.today));
    } catch { /* offline: later */ }
  }

  // knop per naam → eerste noot uit de pool met die naam (octaaf doet bij knoppen niet mee)
  const byName = (n: string) => pool.find((id) => name(id) === n) ?? all.find((id) => name(id) === n)!;

  useEffect(() => {
    if (!running || input !== "buttons") return;
    const h = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (names.includes(k)) answer(byName(k)); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = names.filter((n) => !newNote || n !== name(newNote) || Object.keys(statuses).some((id) => name(id) === n));
  const best = history.filter((x) => x.completed).reduce<Round | null>((b, x) => (!b || x.ms < b.ms ? x : b), null);
  const today = new Date().toDateString();
  const playedToday = history.filter((r) => new Date(r.playedAt).toDateString() === today).length;
  const hearts = (
    <span className="text-accent text-2xl tracking-[6px]" aria-label={`${lives} van ${LIVES} levens`}>
      {"♥".repeat(Math.max(0, lives))}<span className="opacity-30">{"♥".repeat(LIVES - Math.max(0, lives))}</span>
    </span>
  );

  // spelen en het resultaat: in focus, over het hele scherm; de rest van de app (tabbalk, avatar) is zolang weg
  if (running || result) {
    const good = answers.filter((a) => a.correct).length;
    return (
      <Focus label="Spelen">
        {running ? (
          <>
            <div className="flex items-center gap-3 px-4 py-3">
              <button type="button" onClick={quit} className="rounded-full border-2 border-line bg-surface px-4 py-2 font-display font-semibold cursor-pointer">✕ Klaar</button>
              <div className="flex-1 text-center">{hearts}</div>
              <div className="tabular-nums font-display font-bold text-muted min-w-16 text-right">{showTimer ? fmt(elapsed).slice(0, -4) : ""}</div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4">
              <div className="w-full max-w-[1000px] rounded-3xl bg-surface p-4">
                <StaffRow clef={instrument.clef} naming={naming} height={220} cursor={pos}
                  notes={seq.map((n, i) => {
                    const a = answers[i];
                    const col = a ? (a.correct ? "var(--color-kent)" : "var(--color-wrong)") : "currentColor";
                    return { id: n, color: col, label: a ? cap(name(n)) : "", badge: a ? { text: cap(name(n)), color: col } : undefined };
                  })} />
              </div>
              <div className="min-h-[1.6em] mt-3 font-display font-semibold text-lg text-muted" aria-live="polite">{msg}</div>
              <div className="text-sm text-muted">Noot {Math.min(pos + 1, seq.length)} van {seq.length}</div>
            </div>
            {input === "buttons" ? (
              // alle knoppen op één rij; op een smal scherm in twee gelijke rijen
              <div className="w-full max-w-[1100px] mx-auto px-4 pb-4 grid gap-2 grid-cols-[repeat(var(--half),minmax(0,1fr))] sm:grid-cols-[repeat(var(--n),minmax(0,1fr))]"
                style={{ "--n": names.length, "--half": Math.ceil(names.length / 2) } as React.CSSProperties}>
                {names.map((n) => (
                  <button key={n} type="button" onClick={() => answer(byName(n))}
                    className="py-4 sm:py-5 rounded-2xl text-white bg-key cursor-pointer shadow-[0_4px_0_var(--color-key-shadow)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-key-shadow)]">
                    {/* de grootte op een span: "button { font: inherit }" in index.css wint van tekstklassen op de knop */}
                    <span className="font-display font-extrabold text-3xl">{cap(n)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center px-4 pb-6">
                <div className={`font-display font-extrabold text-6xl min-h-[1.1em] ${reading && reading.midi === soundingMidi(seq[pos] ?? seq[0]!, instrument.transposition) ? "text-kent" : ""}`}>
                  {reading ? cap(name(toId(midiToPitch(reading.midi - instrument.transposition)))) : "…"}
                </div>
                <div className="relative h-3.5 max-w-[320px] mx-auto my-2 rounded-full border-2 border-line bg-surface overflow-hidden">
                  <div className="absolute top-0 bottom-0 w-2.5 rounded bg-accent -translate-x-1/2 transition-[left]" style={{ left: `${50 + (reading?.cents ?? 0)}%` }} />
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-fg -translate-x-1/2" />
                </div>
                <div className="text-muted text-sm">Speel de noot op je {instrument.name.toLowerCase()}</div>
              </div>
            )}
          </>
        ) : result && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="text-6xl text-key tracking-[8px]" aria-label={`${result.stars} van 3 sterren`}>{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)}</div>
            <h2 className="font-display font-bold text-3xl m-0">{result.completed ? `${good} van ${seq.length} goed` : "Levens op!"}</h2>
            <p className="text-muted m-0">
              {[!result.completed && `${good} van ${seq.length} goed`, showTimer && result.completed && secondsLabel(elapsed), hardLabel(answers.filter((a) => !a.correct).map((a) => cap(name(a.expected))))].filter(Boolean).join(" · ")}
            </p>
            {gain && <div className="rounded-2xl bg-ok/15 text-ok font-semibold px-4 py-2">{gain}</div>}
            <div className="flex flex-wrap justify-center gap-3 mt-3">
              <Chip primary className="text-lg px-8 py-3" onClick={start}>Nog een keer</Chip>
              {onDone && <Chip className="text-lg px-8 py-3" onClick={() => { setResult(null); onDone(); }}>Naar Vandaag</Chip>}
              {!onDone && <Chip className="text-lg px-8 py-3" onClick={() => setResult(null)}>Klaar</Chip>}
            </div>
          </div>
        )}
      </Focus>
    );
  }

  // klaarzetten: één knop in het midden; knoppen of sax is de enige keuze die op het scherm blijft
  return (
    <div className="flex flex-col items-center gap-4 text-center py-4">
      <div className="w-full max-w-[640px] rounded-3xl bg-surface p-4 flex flex-col items-center gap-2">
        <div className="w-full"><StaffRow clef={instrument.clef} naming={naming} height={150}
          notes={[...new Map(pool.map((n) => [name(n), n])).values()].slice(0, 8).map((id) => ({ id, color: newNote && name(id) === name(newNote) ? "var(--color-accent)" : "currentColor", label: "" }))} /></div>
        <p className="text-muted m-0">
          Noten voor {!student || isAnonymous || student.userId === profile?.id ? "jou" : student.name}: <b className="text-fg">{shown.map(cap).join(" ")}</b>
          {newNote && <> · nieuw: <b className="text-accent">{cap(name(newNote))}</b></>}
        </p>
      </div>
      <Chip primary className="text-xl px-12 py-4" onClick={start}>▶ Spelen</Chip>
      <Segmented value={input} options={[["buttons", "Knoppen"], ["mic", `🎤 Met je ${instrument.name.toLowerCase()}`]]} onChange={(v) => { setInput(v); localStorage.setItem("nk.input", v); }} label="Antwoorden met" />
      {micError && <p className="text-sm text-muted border border-line rounded-lg p-2 m-0">{micError}</p>}
      <p className="text-sm text-muted m-0">
        {[`${LENGTH} noten, ${LIVES} levens`, showTimer && best && `beste tijd: ${secondsLabel(best.ms).replace(" seconden", " s")}`, playedToday > 0 && `vandaag ${playedToday} keer gespeeld`].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}
