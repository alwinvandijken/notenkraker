import { useMemo, useState } from "react";
import { instrumentNotes, noteName, parseId, primaryFingering, type NoteId, type NoteStatus } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { useApp } from "@/lib/store";
import { StaffNote, StaffRow } from "@/components/Staff";
import { Fingering } from "@/components/Fingering";
import { Card, Chip, Ghost, Segmented } from "@/components/ui";

const STATUS: Array<[NoteStatus | "", string]> = [["kent", "Kent al"], ["les", "In de les"], ["moet", "Moet nog leren"], ["", "Nog niet aan de beurt"]];
const FILTERS: Array<["mine" | "les" | "all", string]> = [["mine", "Mijn noten"], ["les", "In de les"], ["all", "Alle noten"]];
const COLOR: Record<NoteStatus, string> = { kent: "var(--color-kent)", les: "var(--color-accent)", moet: "var(--color-moet)" };

function octaveLabel(id: NoteId, range: [string, string]): string {
  const o = parseId(id).octave, lo = parseId(range[0]).octave, hi = parseId(range[1]).octave;
  if (hi - lo <= 1) return "";
  return o <= lo ? "laag" : o >= hi ? "hoog" : "";
}

export function Learn() {
  const { students, studentId, statuses, setStatus } = useApp();
  const student = students.find((s) => s.id === studentId);
  const instrument = getInstrument(student?.instrumentId ?? "altsax");
  const naming = student?.naming ?? "nl";
  const all = useMemo(() => instrumentNotes(instrument), [instrument]);
  const [filter, setFilter] = useState<"mine" | "les" | "all">(() => (localStorage.getItem("nk.filter") as "mine" | "les" | "all") || "mine");
  const [view, setView] = useState<"buttons" | "staff">(() => (localStorage.getItem("nk.view") as "buttons" | "staff") || "buttons");
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<NoteId>(instrument.starterNotes[0] ?? all[0]!);

  const visible = filter === "all" ? all : all.filter((n) => (filter === "les" ? statuses[n] === "les" : Boolean(statuses[n])));
  const current = visible.includes(sel) ? sel : (visible[0] ?? sel);
  const fingering = primaryFingering(instrument, current);
  const needed = useMemo(() => new Set(all.filter((n) => statuses[n]).flatMap((n) => primaryFingering(instrument, n))), [all, statuses, instrument]);
  const keyNames = fingering.map((k) => instrument.keyNames[k] ?? k);
  const name = (id: NoteId) => noteName(parseId(id), naming);
  const change = (f: typeof filter) => { setFilter(f); localStorage.setItem("nk.filter", f); };
  const changeView = (v: typeof view) => { setView(v); localStorage.setItem("nk.view", v); };
  const step = (d: number) => { if (!visible.length) return; const i = visible.indexOf(current); setSel(visible[(i + d + visible.length) % visible.length]!); };

  return (
    <div>
      <div className="font-display font-semibold text-lg mt-5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        Noten
        <span className="flex flex-wrap gap-2">{FILTERS.map(([v, t]) => <Chip key={v} active={filter === v} onClick={() => change(v)}>{t}</Chip>)}</span>
        <Segmented value={view} options={[["buttons", "Knoppen"], ["staff", "Notenbalk"]]} onChange={changeView} label="Weergave" />
      </div>

      {visible.length === 0 ? (
        <p className="text-muted p-3">Nog geen noten voor deze leerling. Kies "Alle noten" en geef noten een status.</p>
      ) : view === "buttons" ? (
        <div className="flex flex-wrap gap-2">
          {visible.map((n) => {
            const st = statuses[n];
            return (
              <button key={n} type="button" aria-pressed={n === current} onClick={() => setSel(n)}
                className="w-[54px] h-[54px] rounded-full border-2 font-display font-semibold text-xl cursor-pointer relative aria-pressed:outline-3 aria-pressed:outline-fg aria-pressed:outline-offset-1"
                style={{ borderColor: st ? COLOR[st] : "var(--color-line)", background: st === "kent" ? "var(--color-kent-soft)" : st === "les" ? "var(--color-accent-soft)" : st === "moet" ? "var(--color-moet-soft)" : "var(--color-surface)" }}>
                <span className={parseId(n).accidental ? "text-base" : ""}>{name(n).charAt(0).toUpperCase() + name(n).slice(1)}</span>
                {octaveLabel(n, instrument.range) && <span className="block text-[10px] font-sans font-normal -mt-1 opacity-70">{octaveLabel(n, instrument.range)}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <StaffRow clef={instrument.clef} naming={naming} onSelect={(id) => setSel(id)}
          notes={visible.map((n) => ({ id: n, selected: n === current, color: statuses[n] ? COLOR[statuses[n]!] : undefined, sub: octaveLabel(n, instrument.range) }))} />
      )}

      <Card className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div>
          <div className="font-display font-extrabold text-6xl leading-none text-accent text-center">
            {name(current).charAt(0).toUpperCase() + name(current).slice(1)}
            <small className="block text-lg text-muted font-semibold">"{name(current)}"{octaveLabel(current, instrument.range) ? ` · ${octaveLabel(current, instrument.range)}` : ""}</small>
          </div>
          <StaffNote note={current} clef={instrument.clef} />
        </div>
        <div>
          <Fingering instrument={instrument} pressed={fingering} needed={needed} showAll={showAll} />
          <p className="text-center mt-2">
            {keyNames.length ? <>Druk in: {keyNames.map((k, i) => <b key={i} className="text-accent">{k}{i < keyNames.length - 1 ? ", " : ""}</b>)}</> : <>Niets indrukken, alles <b className="text-accent">open</b>!</>}
          </p>
          <p className="text-center mt-2"><Ghost onClick={() => setShowAll((v) => !v)}>{showAll ? "Alleen de kleppen voor mijn noten" : "Toon alle kleppen"}</Ghost></p>
        </div>
        {student && (
          <div className="sm:col-span-2 border-t-2 border-dashed border-line pt-3 flex flex-wrap gap-2 justify-center items-center">
            <div className="w-full text-center text-muted text-sm">Deze noot voor {student.name}:</div>
            {STATUS.map(([v, t]) => (
              <Chip key={v} active={(statuses[current] ?? "") === v} onClick={() => setStatus(current, v || null)}
                style={(statuses[current] ?? "") === v && v ? { borderColor: COLOR[v], background: v === "kent" ? "var(--color-kent-soft)" : v === "les" ? "var(--color-accent-soft)" : "var(--color-moet-soft)" } : undefined}>{t}</Chip>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-center gap-3 mt-4">
        <Chip onClick={() => step(-1)}>◀ Vorige</Chip>
        <Chip onClick={() => step(1)}>Volgende ▶</Chip>
      </div>
      <p className="text-muted text-sm mt-4 flex flex-wrap gap-x-5 gap-y-2 justify-center">
        <span><i className="inline-block w-4 h-4 rounded align-middle border-2" style={{ borderColor: COLOR.kent, background: "var(--color-kent-soft)" }} /> kent al</span>
        <span><i className="inline-block w-4 h-4 rounded align-middle border-2" style={{ borderColor: COLOR.les, background: "var(--color-accent-soft)" }} /> in de les</span>
        <span><i className="inline-block w-4 h-4 rounded align-middle border-2" style={{ borderColor: COLOR.moet, background: "var(--color-moet-soft)" }} /> moet nog leren</span>
        <span><i className="inline-block w-4 h-4 rounded-full align-middle border-2 border-fg bg-pressed" /> klep indrukken</span>
        <span><i className="inline-block w-4 h-4 rounded-full align-middle border-2 border-fg" /> open laten</span>
      </p>
    </div>
  );
}
