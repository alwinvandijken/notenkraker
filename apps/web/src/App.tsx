import { useEffect, useState } from "react";
import { INSTRUMENTS } from "@notenkraker/instruments";
import { client, hasBackend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Auth } from "@/screens/Auth";
import { Learn } from "@/screens/Learn";
import { Game } from "@/screens/Game";
import { Chip, Ghost, Segmented } from "@/components/ui";

const PRESETS: Record<string, { kent: string[]; les: string[] }> = {
  "1": { kent: ["g4", "a4", "b4", "c5", "d5"], les: [] },
  "2": { kent: ["c4", "d4", "e4", "f4", "g4", "a4", "b4", "c5", "d5", "e5", "f5", "g5"], les: ["fis4", "gis4", "fis5", "gis5"] },
};

export function App() {
  const { profile, students, studentId, mode, init, selectStudent, setMode, loadStudents } = useApp();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInst, setNewInst] = useState("altsax");
  const [preset, setPreset] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => { void init(); }, [init]);

  if (profile === undefined) return <div className="p-6 text-muted">Laden…</div>;
  if (!profile) return <Auth />;

  const student = students.find((s) => s.id === studentId);
  const canManage = profile.role === "leraar" || !hasBackend;

  async function addStudent() {
    const name = newName.trim(); if (!name) return;
    const s = await client.students.create({ name, instrumentId: newInst });
    const p = PRESETS[preset];
    if (p) { for (const n of p.kent) await client.notes.setStatus(s.id, n, "kent"); for (const n of p.les) await client.notes.setStatus(s.id, n, "les"); }
    setAdding(false); setNewName(""); setPreset("");
    await loadStudents(); selectStudent(s.id);
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 pt-6 pb-12">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display font-extrabold text-4xl leading-none">Notenkraker</h1>
          <p className="text-muted mt-1">Kies een leerling, tik op een noot en zie wat je indrukt.</p>
        </div>
        <Ghost onClick={() => client.auth.signOut()}>{profile.displayName || "Uitloggen"} ⏏</Ghost>
      </header>

      <div className="font-display font-semibold text-lg mt-5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        Leerling
        <select id="student" aria-label="Leerling" value={studentId ?? ""} onChange={(e) => selectStudent(e.target.value || null)}
          className="rounded-xl border-2 border-line bg-surface px-3 py-1.5 font-bold">
          {students.length === 0 && <option value="">— nog geen leerling —</option>}
          {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {canManage && <Ghost onClick={() => setAdding((v) => !v)}>+ leerling</Ghost>}
        {profile.role === "leraar" && hasBackend && (
          <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); if (!code) return; await client.students.linkByCode(code); setCode(""); await loadStudents(); }}>
            <input id="code" aria-label="Uitnodigingscode" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code" className="w-24 rounded-xl border-2 border-line bg-surface px-2 py-1 text-sm" />
            <Ghost>Koppel</Ghost>
          </form>
        )}
        <span className="ml-auto"><Segmented value={mode} options={[["learn", "Grepen"], ["game", "Spel"]]} onChange={setMode} label="Onderdeel" /></span>
      </div>

      {adding && (
        <div className="rounded-2xl border-2 border-line bg-surface p-3 mb-2 flex flex-wrap gap-2 items-center">
          <input id="newName" className="flex-1 min-w-40 rounded-xl border-2 border-line bg-bg px-3 py-2" placeholder="Naam" maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addStudent(); }} />
          <select id="newInst" value={newInst} onChange={(e) => setNewInst(e.target.value)} className="rounded-xl border-2 border-line bg-surface px-3 py-2 font-bold">
            {INSTRUMENTS.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <select id="preset" value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded-xl border-2 border-line bg-surface px-3 py-2 font-bold">
            <option value="">Start zonder noten</option>
            <option value="1">Begin: kent G A B C D</option>
            <option value="2">Gevorderd: lage C t/m hoge G, fis en gis in de les</option>
          </select>
          <Chip onClick={addStudent}>Toevoegen</Chip>
          <Ghost onClick={() => setAdding(false)}>Annuleren</Ghost>
        </div>
      )}
      {!hasBackend && <p className="text-xs text-muted border border-line rounded-lg px-3 py-2 mb-2">Zonder backend: gegevens staan alleen in deze browser. Zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env voor de echte database.</p>}
      {!student && students.length === 0 && <p className="text-muted p-3">Voeg eerst een leerling toe.</p>}

      {mode === "learn" ? <Learn /> : <Game />}
    </div>
  );
}
