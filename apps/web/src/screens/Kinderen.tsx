import { useState } from "react";
import { INSTRUMENTS } from "@notenkraker/instruments";
import { rightsFor, type Student } from "@notenkraker/client";
import { client, hasBackend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { KindUitnodigen } from "@/components/KindUitnodigen";
import { Card, Chip, Ghost } from "@/components/ui";

const PRESETS: Record<string, { kent: string[]; les: string[] }> = {
  "1": { kent: ["g4", "a4", "b4", "c5", "d5"], les: [] },
  "2": { kent: ["c4", "d4", "e4", "f4", "g4", "a4", "b4", "c5", "d5", "e5", "f5", "g5"], les: ["fis4", "gis4", "fis5", "gis5"] },
};

/** Beheerscherm "Mijn kinderen" (ouder) of "Mijn leerlingen" (leraar): aanmaken, laten inloggen, koppelen. */
export function Kinderen({ onPractice }: { onPractice(studentId: string): void }) {
  const { profile, students, loadStudents } = useApp();
  const rights = rightsFor(profile?.role ?? null);
  const isOuder = profile?.role === "ouder";
  const [adding, setAdding] = useState(students.length === 0);
  const [newName, setNewName] = useState("");
  const [newInst, setNewInst] = useState("altsax");
  const [preset, setPreset] = useState("");
  const [linkCode, setLinkCode] = useState("");
  const [error, setError] = useState("");
  const [kindInvite, setKindInvite] = useState<{ name: string; code: string } | null>(null);
  const [leraarCode, setLeraarCode] = useState<{ studentId: string; code: string } | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Dat lukte niet"); }
  }

  async function addStudent() {
    const name = newName.trim(); if (!name) return;
    const s = await client.students.create({ name, instrumentId: newInst });
    const p = PRESETS[preset];
    if (p) { for (const n of p.kent) await client.notes.setStatus(s.id, n, "kent"); for (const n of p.les) await client.notes.setStatus(s.id, n, "les"); }
    setAdding(false); setNewName(""); setPreset("");
    await loadStudents();
  }

  const inviteKind = (s: Student) => run(async () => setKindInvite({ name: s.name, code: await client.students.inviteCode(s.id, "kind") }));
  const inviteLeraar = (s: Student) => run(async () => setLeraarCode({ studentId: s.id, code: await client.students.inviteCode(s.id, "leraar") }));
  const instrumentName = (id: string) => INSTRUMENTS.find((i) => i.id === id)?.name ?? id;
  const field = "rounded-xl border-2 border-line bg-bg px-3 py-2";

  return (
    <div className="flex flex-col gap-3 mt-5">
      <h2 className="font-display font-bold text-2xl m-0">{rights.studentsTitle}</h2>
      {error && <p className="text-sm text-wrong m-0">{error}</p>}
      {students.length === 0 && !adding && <p className="text-muted m-0">{isOuder ? "Nog geen kinderen." : "Nog geen leerlingen."}</p>}

      {students.map((s) => (
        <Card key={s.id} className="flex flex-wrap items-center gap-3 !p-4">
          <div className="w-10 h-10 rounded-full bg-kent text-white font-bold flex items-center justify-center shrink-0">{s.name.slice(0, 1).toUpperCase()}</div>
          <div className="flex-1 min-w-40">
            <div className="font-display font-bold">{s.name}</div>
            <div className="text-sm text-muted">{instrumentName(s.instrumentId)} · {s.userId ? "logt zelf in ✓" : "nog geen eigen login"}</div>
            {leraarCode?.studentId === s.id && <div className="text-sm mt-1">Geef deze code aan de leraar: <b className="font-mono tracking-widest">{leraarCode.code}</b> (7 dagen geldig)</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {isOuder && hasBackend && !s.userId && <Chip primary onClick={() => void inviteKind(s)}>{s.name} laten inloggen</Chip>}
            {rights.canInvite && hasBackend && <Ghost onClick={() => void inviteLeraar(s)}>Code voor leraar</Ghost>}
            <Ghost onClick={() => onPractice(s.id)}>Oefenen</Ghost>
          </div>
        </Card>
      ))}

      {adding ? (
        <Card className="flex flex-wrap gap-2 items-center !p-4">
          <input id="newName" aria-label="Naam" className={`${field} flex-1 min-w-40`} placeholder="Naam" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void run(addStudent); }} />
          <select id="newInst" aria-label="Instrument" value={newInst} onChange={(e) => setNewInst(e.target.value)} className={`${field} font-bold`}>
            {INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select id="preset" aria-label="Startniveau" value={preset} onChange={(e) => setPreset(e.target.value)} className={`${field} font-bold`}>
            <option value="">Start zonder noten</option>
            <option value="1">Begin: kent G A B C D</option>
            <option value="2">Gevorderd: lage C t/m hoge G, fis en gis in de les</option>
          </select>
          <Chip primary onClick={() => void run(addStudent)}>Toevoegen</Chip>
          {students.length > 0 && <Ghost onClick={() => setAdding(false)}>Annuleren</Ghost>}
        </Card>
      ) : (
        <Chip className="self-start" onClick={() => setAdding(true)}>{isOuder ? "+ kind" : "+ leerling"}</Chip>
      )}

      {rights.canLinkByCode && hasBackend && (
        <Card className="!p-4">
          <form className="flex flex-wrap gap-2 items-center" onSubmit={(e) => { e.preventDefault(); if (linkCode) void run(async () => { await client.students.linkByCode(linkCode); setLinkCode(""); await loadStudents(); }); }}>
            <span className="font-display font-semibold">Leerling koppelen met een code van de ouder</span>
            <input id="code" aria-label="Uitnodigingscode" value={linkCode} onChange={(e) => setLinkCode(e.target.value.toUpperCase())} placeholder="Code" className={`${field} w-28 font-mono`} />
            <Chip type="submit">Koppel</Chip>
          </form>
        </Card>
      )}

      {kindInvite && <KindUitnodigen name={kindInvite.name} code={kindInvite.code} onClose={() => { setKindInvite(null); void loadStudents(); }} />}
    </div>
  );
}
