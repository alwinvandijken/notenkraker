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
import { KindPagina } from "@/screens/KindPagina";
import { DagPagina } from "@/screens/DagPagina";
import { Kennismaking } from "@/screens/Kennismaking";
import { Profiel } from "@/screens/Profiel";
import { Menu, type MenuItem } from "@/components/Menu";
import { KoppelMelding } from "@/components/KoppelMelding";
import { NotenOvernemen } from "@/components/NotenOvernemen";
import { Chip, Segmented } from "@/components/ui";

type Screen = "overzicht" | "kind" | "dag" | "oefenen" | "kinderen" | "profiel";
interface NavState { screen: Screen; childId: string | null; day: { date: string; back: "overzicht" | "kind" } | null }
/** na herladen blijft het scherm uit de browsergeschiedenis staan */
const navState = () => (window.history.state?.screen ? (window.history.state as NavState) : null);

function greeting(name: string, now = new Date()) {
  const h = now.getHours();
  return `${h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond"}, ${name.split(" ")[0]}`;
}

export function AppMetLogin() {
  const { profile, students, studentId, statuses, mode, init, selectStudent, setMode, setStatus, loadStudents } = useApp();
  // ouder en leraar starten op het overzicht, een leerling meteen bij het oefenen
  const [screen, setScreen] = useState<Screen | null>(() => navState()?.screen ?? null);
  /** het kind waarvan de pagina open is (scherm "kind") */
  const [childId, setChildId] = useState<string | null>(() => navState()?.childId ?? null);
  /** de dag die open is (scherm "dag"), en waar "terug" heen gaat */
  const [day, setDay] = useState<NavState["day"]>(() => navState()?.day ?? null);

  useEffect(() => { void init(); }, [init]);
  // terug in de browser (of terugvegen op de iPhone) gaat naar het vorige scherm in de app
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}) as Partial<NavState>;
      setScreen(st.screen ?? null); setChildId(st.childId ?? null); setDay(st.day ?? null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (profile === undefined) return <div className="p-6 text-muted">Laden…</div>;
  if (!profile) return <Auth />;
  const rights = rightsFor(profile.role);
  if (rights.mustChooseRole) return <Welkom />;

  const hasDashboard = rights.studentsTitle !== null;
  const current: Screen = screen ?? (hasDashboard ? "overzicht" : "oefenen");
  const student = students.find((s) => s.id === studentId);
  const items: MenuItem[] = [
    ...(hasDashboard ? [{ key: "overzicht", label: "Overzicht", onSelect: () => go("overzicht"), active: current === "overzicht" || current === "kind" || current === "dag" }] : []),
    { key: "oefenen", label: "Oefenen", onSelect: () => go("oefenen"), active: current === "oefenen" },
    ...(rights.studentsTitle ? [{ key: "kinderen", label: rights.studentsTitle, onSelect: () => go("kinderen"), active: current === "kinderen" }] : []),
    { key: "profiel", label: "Mijn profiel", onSelect: () => go("profiel"), active: current === "profiel" },
    { key: "welkom", label: "Welkomstpagina", onSelect: () => window.location.assign("/?welkom") },
    { key: "uit", label: "Uitloggen", onSelect: () => void client.auth.signOut() },
  ];
  /** naar een ander scherm, bovenaan beginnen; komt in de browsergeschiedenis */
  const go = (s: Screen, extra: Partial<Omit<NavState, "screen">> = {}) => {
    const st: NavState = { screen: s, childId: extra.childId ?? childId, day: extra.day ?? day };
    window.history.pushState(st, "");
    setScreen(st.screen); setChildId(st.childId); setDay(st.day);
    window.scrollTo(0, 0);
  };
  const practice = (id: string) => { selectStudent(id); go("oefenen"); };
  const menu = <Menu title={profile.displayName || "Menu"} items={items} />;
  const modeSwitch = <Segmented value={mode} options={[["learn", "Grepen"], ["game", "Spel"], ["vrij", "🎷 Vrij oefenen"]]} onChange={setMode} label="Onderdeel" />;
  const studentPicker = students.length > 1 && (
    <select id="student" aria-label={profile.role === "ouder" ? "Kind" : "Leerling"} value={studentId ?? ""} onChange={(e) => selectStudent(e.target.value || null)}
      className="rounded-xl border-2 border-line bg-surface px-3 py-1.5 font-display font-bold">
      {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );

  // eerste keer oefenen met deze leerling: even kennismaken (AC-115); ook als het kind op het toestel van de ouder speelt
  if (current === "oefenen" && student && !student.onboardedAt) {
    return (
      <div className="max-w-[900px] mx-auto px-4 pt-6 pb-12">
        <header className="flex items-start justify-between gap-3 mb-4">
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl leading-none m-0">{student.userId === profile.id ? "Notenkraker" : student.name}</h1>
          {menu}
        </header>
        <NotenOvernemen />
        <Kennismaking key={student.id} student={student} statuses={statuses} onDone={() => void loadStudents()} />
      </div>
    );
  }

  // Grepen: de grepentabel van het proefconcept (AC-107) over het hele scherm, met de status van de leerling
  if (current === "oefenen" && mode === "learn" && student) {
    return (
      <Grepentabel instrument={getInstrument(student.instrumentId)} title={student.name}
        student={{ statuses, setStatus: (n, st) => void setStatus(n, st) }}
        actions={<div className="flex flex-wrap items-center gap-3">{studentPicker}{modeSwitch}</div>} menu={menu}
        notice={<><KoppelMelding /><NotenOvernemen /></>} />
    );
  }

  return (
    <div className={`${current === "overzicht" || current === "kind" || current === "dag" ? "max-w-[1240px]" : "max-w-[900px]"} mx-auto px-4 pt-6 pb-12`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {(current === "kind" || current === "dag") && (
            <button type="button" onClick={() => window.history.back()}
              className="text-sm font-semibold text-muted bg-transparent cursor-pointer mb-2 -ml-1 px-1">
              ← {current === "dag" && day?.back === "kind" ? (students.find((s) => s.id === childId)?.name ?? "Terug") : "Overzicht"}
            </button>
          )}
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl leading-none">
            {current === "overzicht" ? greeting(profile.displayName) : current === "kind" || current === "dag" ? (students.find((s) => s.id === childId)?.name ?? "") : "Notenkraker"}
          </h1>
          {current === "overzicht" && <p className="text-muted mt-1">Zo ging het oefenen deze week</p>}
          {current === "oefenen" && <p className="text-muted mt-1">{mode === "vrij" ? "Speel wat je wilt. Ik tel mee hoe lang ik je hoor." : "Speel het notenspel."}</p>}
        </div>
        {menu}
      </header>
      <KoppelMelding />
      <NotenOvernemen />

      {current === "overzicht" && (
        <Dashboard onManage={() => go("kinderen")}
          onOpenChild={(id) => go("kind", { childId: id })}
          onOpenDay={(id, date) => go("dag", { childId: id, day: { date, back: "overzicht" } })} />
      )}
      {current === "kind" && childId && (
        <KindPagina studentId={childId} onPractice={() => practice(childId)} onOpenDay={(date) => go("dag", { day: { date, back: "kind" } })} />
      )}
      {current === "dag" && childId && day && <DagPagina studentId={childId} date={day.date} onDate={(date) => {
        // bladeren tussen dagen vervangt de dag in de geschiedenis, zodat terug naar de vorige pagina gaat
        const next = { ...day, date }; setDay(next); window.history.replaceState({ screen: "dag", childId, day: next } satisfies NavState, "");
      }} />}
      {current === "kinderen" && <Kinderen onPractice={practice} />}
      {current === "profiel" && <Profiel onLinked={() => go("oefenen")} onRedoIntake={() => go("oefenen")} />}
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
              {rights.studentsTitle && <Chip primary onClick={() => go("kinderen")}>{profile.role === "ouder" ? "+ kind" : "+ leerling"}</Chip>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
