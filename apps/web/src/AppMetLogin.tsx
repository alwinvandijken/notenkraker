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
import { HuiswerkGeven } from "@/screens/HuiswerkGeven";
import { HuiswerkKaart, HuiswerkRegel, useHomework } from "@/components/Huiswerk";
import { Menu, type MenuItem } from "@/components/Menu";
import { KoppelMelding } from "@/components/KoppelMelding";
import { NotenOvernemen } from "@/components/NotenOvernemen";
import { Chip, Segmented } from "@/components/ui";
import { FeedbackGeven, FeedbackKnop } from "@/screens/FeedbackGeven";
import { Beheer, FeedbackDetail, type BeheerTab } from "@/screens/Beheer";

type Screen = "overzicht" | "kind" | "dag" | "huiswerk" | "oefenen" | "kinderen" | "profiel" | "feedback" | "beheer" | "feedbackdetail";
interface NavState {
  screen: Screen; childId: string | null; day: { date: string; back: "overzicht" | "kind" } | null;
  /** feedback: de pagina waar het icoontje werd aangetikt; beheer: tabblad en geopende feedback */
  from?: string; tab?: BeheerTab; feedbackId?: string;
}
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
  const [extra, setExtra] = useState<Pick<NavState, "from" | "tab" | "feedbackId">>(() => navState() ?? {});

  useEffect(() => { void init(); }, [init]);
  // terug in de browser (of terugvegen op de iPhone) gaat naar het vorige scherm in de app
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}) as Partial<NavState>;
      setScreen(st.screen ?? null); setChildId(st.childId ?? null); setDay(st.day ?? null);
      setExtra({ from: st.from, tab: st.tab, feedbackId: st.feedbackId });
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
  const child = students.find((s) => s.id === childId);
  const onChildPage = current === "kind" || current === "dag" || current === "huiswerk";
  const items: MenuItem[] = [
    ...(hasDashboard ? [{ key: "overzicht", label: "Overzicht", onSelect: () => go("overzicht"), active: current === "overzicht" || onChildPage }] : []),
    { key: "oefenen", label: "Oefenen", onSelect: () => go("oefenen"), active: current === "oefenen" },
    ...(rights.studentsTitle ? [{ key: "kinderen", label: rights.studentsTitle, onSelect: () => go("kinderen"), active: current === "kinderen" }] : []),
    { key: "profiel", label: "Mijn profiel", onSelect: () => go("profiel"), active: current === "profiel" },
    ...(profile.role === "admin" ? [{ key: "beheer", label: "Beheer", onSelect: () => go("beheer", { tab: "feedback" }), active: current === "beheer" || current === "feedbackdetail" }] : []),
    { key: "welkom", label: "Welkomstpagina", onSelect: () => window.location.assign("/?welkom") },
    { key: "uit", label: "Uitloggen", onSelect: () => void client.auth.signOut() },
  ];
  /** naar een ander scherm, bovenaan beginnen; komt in de browsergeschiedenis */
  const go = (s: Screen, more: Partial<Omit<NavState, "screen">> = {}) => {
    const st: NavState = { screen: s, childId: more.childId ?? childId, day: more.day ?? day, from: more.from, tab: more.tab ?? extra.tab, feedbackId: more.feedbackId };
    window.history.pushState(st, "");
    setScreen(st.screen); setChildId(st.childId); setDay(st.day); setExtra({ from: st.from, tab: st.tab, feedbackId: st.feedbackId });
    window.scrollTo(0, 0);
  };
  /** naam van de pagina voor feedback (AC-116), zodat Alwin weet waar het over gaat */
  const pageName = ({
    overzicht: "Overzicht", kind: `Kindpagina (${child?.name ?? "?"})`, dag: `Dagpagina (${day?.date ?? "?"})`, huiswerk: "Huiswerk geven",
    oefenen: mode === "learn" ? "Grepen" : mode === "game" ? "Notenspel" : "Vrij oefenen", kinderen: rights.studentsTitle ?? "Kinderen",
    profiel: "Mijn profiel", feedback: "Feedback geven", beheer: "Beheer", feedbackdetail: "Beheer: feedback",
  } satisfies Record<Screen, string>)[current];
  const knop = profile.canGiveFeedback && current !== "feedback" ? <FeedbackKnop onOpen={() => go("feedback", { from: pageName })} /> : null;
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
        {knop}
      </div>
    );
  }

  // Grepen: de grepentabel van het proefconcept (AC-107) over het hele scherm, met de status van de leerling
  if (current === "oefenen" && mode === "learn" && student) {
    return (
      <>
      {knop}
      <Grepentabel instrument={getInstrument(student.instrumentId)} title={student.name}
        student={{ statuses, setStatus: (n, st) => void setStatus(n, st) }}
        actions={<div className="flex flex-wrap items-center gap-3">{studentPicker}{modeSwitch}</div>} menu={menu}
        notice={<><KoppelMelding /><NotenOvernemen /><HuiswerkVoorLeerling studentId={student.id} instrumentId={student.instrumentId} compact /></>} />
      </>
    );
  }

  return (
    <div className={`${current === "overzicht" || current === "kind" || current === "dag" ? "max-w-[1240px]" : "max-w-[900px]"} mx-auto px-4 pt-6 pb-12`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {(onChildPage || current === "feedback" || current === "feedbackdetail") && (
            <button type="button" onClick={() => window.history.back()}
              className="text-sm font-semibold text-muted bg-transparent cursor-pointer mb-2 -ml-1 px-1">
              ← {current === "feedback" ? (extra.from ?? "Terug") : current === "feedbackdetail" ? "Beheer"
                : current === "huiswerk" || (current === "dag" && day?.back === "kind") ? (child?.name ?? "Terug") : "Overzicht"}
            </button>
          )}
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl leading-none">
            {current === "overzicht" ? greeting(profile.displayName) : current === "huiswerk" ? `Huiswerk voor ${child?.name ?? ""}` : onChildPage ? (child?.name ?? "")
              : current === "feedback" ? "Feedback geven" : current === "beheer" ? "Beheer" : current === "feedbackdetail" ? "Feedback" : "Notenkraker"}
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
        <KindPagina studentId={childId} onPractice={() => practice(childId)} onOpenDay={(date) => go("dag", { day: { date, back: "kind" } })}
          onGiveHomework={() => go("huiswerk")} />
      )}
      {current === "huiswerk" && childId && <HuiswerkGeven studentId={childId} onDone={() => window.history.back()} />}
      {current === "feedback" && <FeedbackGeven screen={extra.from ?? "onbekend"} onDone={() => window.history.back()} />}
      {current === "beheer" && profile.role === "admin" && (
        <Beheer tab={extra.tab ?? "feedback"} onOpen={(id) => go("feedbackdetail", { feedbackId: id })}
          onTab={(t) => { const st = { ...window.history.state, tab: t }; window.history.replaceState(st, ""); setExtra((e) => ({ ...e, tab: t })); }} />
      )}
      {current === "feedbackdetail" && extra.feedbackId && profile.role === "admin" && <FeedbackDetail id={extra.feedbackId} />}
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
          {student && <HuiswerkVoorLeerling studentId={student.id} instrumentId={student.instrumentId} />}
          {student ? (mode === "vrij" ? <VrijOefenen key={student.id} /> : <Game />) : (
            <div className="rounded-3xl bg-surface p-6 flex flex-col items-start gap-3">
              <p className="m-0">{profile.role === "ouder" ? "Voeg eerst een kind toe." : rights.canCreateStudents ? "Voeg eerst een leerling toe." : "Er is nog geen leerlingprofiel."}</p>
              {rights.studentsTitle && <Chip primary onClick={() => go("kinderen")}>{profile.role === "ouder" ? "+ kind" : "+ leerling"}</Chip>}
            </div>
          )}
        </>
      )}
      {knop}
    </div>
  );
}

/** het lopende huiswerk bij het oefenen, zodat de leerling ziet wat er van hem verwacht wordt */
function HuiswerkVoorLeerling({ studentId, instrumentId, compact }: { studentId: string; instrumentId: string; compact?: boolean }) {
  const items = useHomework(studentId);
  if (!items?.length) return null;
  if (compact) return <div className="grid gap-2 md:grid-cols-2">{items.map((x) => <HuiswerkRegel key={x.h.id} item={x} instrumentId={instrumentId} />)}</div>;
  return (
    <div className="grid gap-3 md:grid-cols-2 mb-3">
      {items.map((x) => <HuiswerkKaart key={x.h.id} item={x} instrumentId={instrumentId} pupil />)}
    </div>
  );
}
