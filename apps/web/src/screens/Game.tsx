import { useEffect, useMemo, useRef, useState } from "react";
import { ageProfile, instrumentNotes, makeSequence, nextNewNote, noteLadder, midiToPitch, NoteMatcher, noteName, parseId, scoreRound, soundingMidi, toId, weightedPool, type NoteId, type PitchReading } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import type { Round } from "@notenkraker/client";
import { client, isAnonymous } from "@/lib/client";
import { useApp } from "@/lib/store";
import { StaffRow } from "@/components/Staff";
import { Card, Chip, Segmented } from "@/components/ui";
import { playMidi } from "@/audio/synth";
import { MicListener } from "@/audio/mic";

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(Math.floor(ms % 1000)).padStart(3, "0")}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Answer = { expected: NoteId; given: NoteId | null; correct: boolean };

export function Game() {
  const { profile, students, studentId, statuses } = useApp();
  const student = students.find((s) => s.id === studentId);
  const instrument = getInstrument(student?.instrumentId ?? "altsax");
  const naming = student?.naming ?? "nl";
  const all = useMemo(() => instrumentNotes(instrument), [instrument]);
  const name = (id: NoteId) => noteName(parseId(id), naming);
  // rondelengte, levens en stopwatch per leeftijdsgroep (AC-115)
  const { roundLength: LENGTH, lives: LIVES, showTimer } = ageProfile(student?.ageBand);
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
    setSeq(makeSequence(pool, LENGTH)); setAnswers([]); setResult(null); setMsg(""); setRunning(true); setMicError("");
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
    if (studentId) { try { await client.rounds.submit({ studentId, mode: input, ms, answers: final }); } catch { /* offline: later */ } }
  }

  // knop per naam → eerste noot uit de pool met die naam (octaaf doet bij knoppen niet mee)
  const byName = (n: string) => pool.find((id) => name(id) === n) ?? all.find((id) => name(id) === n)!;

  useEffect(() => {
    if (!running || input !== "buttons") return;
    const h = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (names.includes(k)) answer(byName(k)); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = [...new Set(all.filter((n) => statuses[n] === "les" || statuses[n] === "moet").map(name))];

  return (
    <div>
      <Card className="mt-3">
        <div className="flex items-center justify-between font-display font-extrabold text-xl">
          <button type="button" onClick={quit} aria-label="Stoppen" className="bg-transparent border-0 text-xl px-2 py-1 cursor-pointer">✕</button>
          <div className="text-[#e0506a] tracking-widest">{running ? `${lives} × ♥` : ""}</div>
          <div className="tabular-nums text-muted">{showTimer ? fmt(elapsed) : ""}</div>
        </div>
        <StaffRow clef={instrument.clef} naming={naming} height={200} cursor={running ? pos : undefined}
          notes={(seq.length ? seq : []).map((n, i) => {
            const a = answers[i];
            const col = a ? (a.correct ? "var(--color-kent)" : "var(--color-wrong)") : "currentColor";
            return { id: n, color: col, label: a ? cap(name(n)) : "", badge: a ? { text: cap(name(n)), color: col } : undefined };
          })} />
        <div className="min-h-[1.6em] text-center font-display font-semibold text-muted mt-2">
          {result ? (
            <div className="py-2">
              <div className="text-5xl text-key tracking-[6px]">{"★".repeat(result.stars)}{"☆".repeat(3 - result.stars)}</div>
              <div className="text-3xl text-fg">{result.completed ? (showTimer ? fmt(elapsed) : "Gehaald!") : "Levens op!"}</div>
              <div>{result.mistakes === 0 ? "Foutloos!" : `${result.mistakes} fout${result.mistakes === 1 ? "" : "en"}`} · +{result.xp} XP</div>
            </div>
          ) : msg}
        </div>
        {running && input === "buttons" && (
          <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(56px, 1fr))" }}>
            {names.map((n) => (
              <button key={n} type="button" onClick={() => answer(byName(n))}
                className="font-display font-extrabold text-2xl py-4 rounded-xl text-white bg-key cursor-pointer shadow-[0_4px_0_var(--color-key-shadow)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-key-shadow)]">{cap(n)}</button>
            ))}
          </div>
        )}
        {running && input === "mic" && (
          <div className="text-center mt-2">
            <div className={`font-display font-extrabold text-5xl min-h-[1.1em] ${reading && reading.midi === soundingMidi(seq[pos] ?? seq[0]!, instrument.transposition) ? "text-kent" : ""}`}>
              {reading ? cap(name(toId(midiToPitch(reading.midi - instrument.transposition)))) : "…"}
            </div>
            <div className="relative h-3.5 max-w-[320px] mx-auto my-2 rounded-full border-2 border-line bg-bg overflow-hidden">
              <div className="absolute top-0 bottom-0 w-2.5 rounded bg-accent -translate-x-1/2 transition-[left]" style={{ left: `${50 + (reading?.cents ?? 0)}%` }} />
              <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-fg -translate-x-1/2" />
            </div>
            <div className="text-muted text-sm">Speel de noot op je {instrument.name.toLowerCase()}</div>
          </div>
        )}
      </Card>

      {!running && (
        <div className="text-center mt-3">
          <p className="text-muted my-3 max-w-[60ch] mx-auto">
            {LENGTH === 8 ? "Acht" : LENGTH} noten op een rij. Tik {showTimer ? "zo snel mogelijk " : ""}de juiste naam. Je hebt <b className="text-fg">{LIVES} levens</b>.<br />
            Noten voor {!student || isAnonymous || student.userId === profile?.id ? "jou" : student.name}: <b className="text-fg">{names.filter((n) => !newNote || n !== name(newNote) || Object.keys(statuses).some((id) => name(id) === n)).map(cap).join(" · ")}</b>
            {focus.length > 0 && <><br />Extra vaak: <b className="text-fg">{focus.map(cap).join(" · ")}</b></>}
            {newNote && <><br />Nieuw: <b className="text-accent">{cap(name(newNote))}</b></>}
          </p>
          <div className="mb-3"><Segmented value={input} options={[["buttons", "Knoppen"], ["mic", `🎤 ${instrument.name} (microfoon)`]]} onChange={(v) => { setInput(v); localStorage.setItem("nk.input", v); }} label="Antwoorden met" /></div>
          {micError && <p className="text-sm text-muted border border-line rounded-lg p-2 inline-block">{micError}</p>}
          <div><Chip primary className="text-xl px-8 py-3" onClick={start}>▶ Spelen</Chip></div>
          {history.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {history.map((r) => {
                const best = history.filter((x) => x.completed).reduce<Round | null>((b, x) => (!b || x.ms < b.ms ? x : b), null);
                const d = new Date(r.playedAt);
                return (
                  <div key={r.id} className={`rounded-xl border-2 px-3 py-2 min-w-[110px] bg-surface ${r === best ? "border-accent" : "border-line"}`}>
                    <div className="text-key text-lg tracking-widest">{"★".repeat(r.stars)}{"☆".repeat(3 - r.stars)}</div>
                    <div className="tabular-nums font-bold text-[#e0506a]">{r.completed ? fmt(r.ms) : "–"}</div>
                    <div className="text-xs text-muted">{d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} {d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}{r === best ? " · snelste" : ""}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
