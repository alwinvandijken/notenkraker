/** De volledige app met login (AC-63, AC-106), bereikbaar op /app zolang het proefconcept op / staat. */
import { useEffect, useState } from "react";
import { rightsFor } from "@notenkraker/client";
import { getInstrument } from "@notenkraker/instruments";
import { client, hasBackend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Auth } from "@/screens/Auth";
import { Welkom } from "@/screens/Welkom";
import { Grepentabel } from "@/screens/Grepentabel";
import { Game } from "@/screens/Game";
import { VrijOefenen } from "@/screens/VrijOefenen";
import { Kinderen } from "@/screens/Kinderen";
import { Dashboard } from "@/screens/Dashboard";
import { Profiel } from "@/screens/Profiel";
import { Menu, type MenuItem } from "@/components/Menu";
import { KoppelMelding } from "@/components/KoppelMelding";
import { Chip, Segmented } from "@/components/ui";

type Screen = "overzicht" | "oefenen" | "kinderen" | "profiel";

function greeting(name: string, now = new Date()) {
  const h = now.getHours();
  return `${h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond"}, ${name.split(" ")[0]}`;
}

export function AppMetLogin() {
  const { profile, students, studentId, statuses, mode, init, selectStudent, setMode, setStatus } = useApp();
  // ouder en leraar starten op het overzicht, een leerling meteen bij het oefenen
  const [screen, setScreen] = useState<Screen | null>(null);

  useEffect(() => { void init(); }, [init]);

  if (profile === undefined) return <div className="p-6 text-muted">Laden…</div>;
  if (!profile) return <Auth />;
  const rights = rightsFor(profile.role);
  if (rights.mustChooseRole) return <Welkom />;

  const hasDashboard = rights.studentsTitle !== null;
  const current: Screen = screen ?? (hasDashboard ? "overzicht" : "oefenen");
  const student = students.find((s) => s.id === studentId);
  const items: MenuItem[] = [
    ...(hasDashboard ? [{ key: "overzicht", label: "Overzicht", onSelect: () => setScreen("overzicht"), active: current === "overzicht" }] : []),
    { key: "oefenen", label: "Oefenen", onSelect: () => setScreen("oefenen"), active: current === "oefenen" },
    ...(rights.studentsTitle ? [{ key: "kinderen", label: rights.studentsTitle, onSelect: () => setScreen("kinderen"), active: current === "kinderen" }] : []),
    { key: "profiel", label: "Mijn profiel", onSelect: () => setScreen("profiel"), active: current === "profiel" },
    { key: "uit", label: "Uitloggen", onSelect: () => void client.auth.signOut() },
  ];
  const practice = (id: string) => { selectStudent(id); setScreen("oefenen"); };
  const menu = <Menu title={profile.displayName || "Menu"} items={items} />;
  const modeSwitch = <Segmented value={mode} options={[["learn", "Grepen"], ["game", "Spel"], ["vrij", "🎷 Vrij oefenen"]]} onChange={setMode} label="Onderdeel" />;
  const studentPicker = students.length > 1 && (
    <select id="student" aria-label={profile.role === "ouder" ? "Kind" : "Leerling"} value={studentId ?? ""} onChange={(e) => selectStudent(e.target.value || null)}
      className="rounded-xl border-2 border-line bg-surface px-3 py-1.5 font-display font-bold">
      {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );

  // Grepen: de grepentabel van het proefconcept (AC-107) over het hele scherm, met de status van de leerling
  if (current === "oefenen" && mode === "learn" && student) {
    return (
      <Grepentabel instrument={getInstrument(student.instrumentId)} title={student.name}
        student={{ statuses, setStatus: (n, st) => void setStatus(n, st) }}
        actions={<div className="flex flex-wrap items-center gap-3">{studentPicker}{modeSwitch}</div>} menu={menu}
        notice={<KoppelMelding />} />
    );
  }

  return (
    <div className={`${current === "overzicht" ? "max-w-[1240px]" : "max-w-[900px]"} mx-auto px-4 pt-6 pb-12`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display font-extrabold text-4xl leading-none">{current === "overzicht" ? greeting(profile.displayName) : "Notenkraker"}</h1>
          {current === "overzicht" && <p className="text-muted mt-1">Zo ging het oefenen deze week</p>}
          {current === "oefenen" && <p className="text-muted mt-1">{mode === "vrij" ? "Speel wat je wilt. Ik tel mee hoe lang ik je hoor." : "Speel het notenspel."}</p>}
        </div>
        {menu}
      </header>
      <KoppelMelding />

      {current === "overzicht" && <Dashboard onPractice={practice} onManage={() => setScreen("kinderen")} />}
      {current === "kinderen" && <Kinderen onPractice={practice} />}
      {current === "profiel" && <Profiel onLinked={() => setScreen("oefenen")} />}
      {current === "oefenen" && (
        <>
          <div className="font-display font-semibold text-lg mt-5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {studentPicker || (student && <span>{student.name}</span>)}
            <span className="ml-auto">{modeSwitch}</span>
          </div>
          {!hasBackend && <p className="text-xs text-muted border border-line rounded-lg px-3 py-2 mb-2">Zonder backend: gegevens staan alleen in deze browser. Zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env voor de echte database.</p>}
          {student ? (mode === "vrij" ? <VrijOefenen key={student.id} /> : <Game />) : (
            <div className="rounded-3xl bg-surface p-6 flex flex-col items-start gap-3">
              <p className="m-0">{profile.role === "ouder" ? "Voeg eerst een kind toe." : rights.canCreateStudents ? "Voeg eerst een leerling toe." : "Er is nog geen leerlingprofiel."}</p>
              {rights.studentsTitle && <Chip primary onClick={() => setScreen("kinderen")}>{profile.role === "ouder" ? "+ kind" : "+ leerling"}</Chip>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
