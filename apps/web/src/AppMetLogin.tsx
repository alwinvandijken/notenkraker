/** De volledige app met login (AC-63, AC-106), bereikbaar op /app zolang het proefconcept op / staat. */
import { useEffect, useState, type ReactNode } from "react";
import { rightsFor } from "@notenkraker/client";
import { getInstrument } from "@notenkraker/instruments";
import { client, hasBackend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Auth } from "@/screens/Auth";
import { Welkom } from "@/screens/Welkom";
import { Grepentabel } from "@/screens/Grepentabel";
import { Weergave } from "@/screens/Weergave";
import { Game } from "@/screens/Game";
import { VrijOefenen } from "@/screens/VrijOefenen";
import { Kinderen } from "@/screens/Kinderen";
import { Dashboard } from "@/screens/Dashboard";
import { KindPagina } from "@/screens/KindPagina";
import { DagPagina } from "@/screens/DagPagina";
import { Kennismaking } from "@/screens/Kennismaking";
import { Profiel } from "@/screens/Profiel";
import { HuiswerkGeven } from "@/screens/HuiswerkGeven";
import { HuiswerkKiezen } from "@/screens/HuiswerkKiezen";
import { Sjablonen } from "@/screens/Sjablonen";
import { Boeken } from "@/screens/Boeken";
import { Taak } from "@/screens/Taak";
import { NieuweBankOpdracht, Opdrachtenbank, Toewijzen } from "@/screens/Opdrachtenbank";
import { Vandaag, type Mode } from "@/screens/Vandaag";
import { GroepKop, NieuweGroep, Vakanties } from "@/screens/Groepen";
import { Menu, type MenuItem } from "@/components/Menu";
import { TabBalk, type Tab } from "@/components/TabBalk";
import { KoppelMelding } from "@/components/KoppelMelding";
import { NotenOvernemen } from "@/components/NotenOvernemen";
import { Chip, Segmented } from "@/components/ui";
import { FeedbackGeven } from "@/screens/FeedbackGeven";
import { Beheer, FeedbackDetail, type BeheerTab } from "@/screens/Beheer";

type Screen = "vandaag" | "overzicht" | "kind" | "dag" | "huiswerk" | "geven" | "oefenen" | "kinderen" | "profiel" | "feedback" | "beheer" | "feedbackdetail" | "sjablonen" | "boeken" | "bank" | "banknieuw" | "toewijzen" | "taak" | "weergave"
  | "groep" | "groepnieuw" | "vakanties" | "les";
interface NavState {
  screen: Screen; childId: string | null; day: { date: string; back: "overzicht" | "kind" } | null;
  /** feedback: de pagina waar je "Feedback geven" koos; huiswerk: de tab waar je vandaan kwam; beheer: tabblad en geopende feedback */
  from?: string; tab?: BeheerTab; feedbackId?: string;
  /** huiswerk voor meerdere leerlingen tegelijk (AC-117); zonder: alleen childId */
  studentIds?: string[];
  /** opdrachten uit de bank om toe te wijzen (AC-118) */
  bankIds?: string[];
  /** het huiswerk dat je aanpast (0013); zonder: nieuw huiswerk voor deze of de volgende les */
  homeworkId?: string;
  /** de taak die open is (AC-120 PR 5) */
  taskId?: string;
  /** lesgroepen (AC-124 stap 2): de groep die open is, de les (datum) en Leerlingen | Groepen */
  groupId?: string; date?: string; view?: "leerlingen" | "groepen";
}
/** na herladen blijft het scherm uit de browsergeschiedenis staan */
const navState = () => (window.history.state?.screen ? (window.history.state as NavState) : null);

/** de drie plekken van de Bibliotheek (AC-120): één tab, drie tabbladen */
const LIBRARY: Array<[Screen, string]> = [["bank", "Opdrachten"], ["sjablonen", "Sjablonen"], ["boeken", "Boeken"]];
const MODE_TITLE: Record<Mode, string> = { learn: "Grepen", game: "Spelen", vrij: "Vrij spelen" };
const ROLE_LABEL = { leerling: "leerling", ouder: "ouder", leraar: "leraar", admin: "beheerder" } as const;

function greeting(name: string, now = new Date()) {
  const h = now.getHours();
  return `${h < 12 ? "Goedemorgen" : h < 18 ? "Goedemiddag" : "Goedenavond"}, ${name.split(" ")[0]}`;
}

export function AppMetLogin() {
  const { profile, students, studentId, statuses, mode, init, selectStudent, setMode, setStatus, loadStudents } = useApp();
  // ouder en leraar starten op het overzicht, een leerling op Vandaag
  const [screen, setScreen] = useState<Screen | null>(() => navState()?.screen ?? null);
  /** het kind waarvan de pagina open is (scherm "kind") */
  const [childId, setChildId] = useState<string | null>(() => navState()?.childId ?? null);
  /** de dag die open is (scherm "dag"), en waar "terug" heen gaat */
  const [day, setDay] = useState<NavState["day"]>(() => navState()?.day ?? null);
  const [extra, setExtra] = useState<Pick<NavState, "from" | "tab" | "feedbackId" | "studentIds" | "bankIds" | "taskId" | "homeworkId" | "groupId" | "date" | "view">>(() => navState() ?? {});
  /** de naam van de groep die open is, voor de titel */
  const [groupTitle, setGroupTitle] = useState("");

  useEffect(() => { void init(); }, [init]);
  // terug in de browser (of terugvegen op de iPhone) gaat naar het vorige scherm in de app
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = (e.state ?? {}) as Partial<NavState>;
      setScreen(st.screen ?? null); setChildId(st.childId ?? null); setDay(st.day ?? null);
      setExtra({ from: st.from, tab: st.tab, feedbackId: st.feedbackId, studentIds: st.studentIds, bankIds: st.bankIds, taskId: st.taskId, homeworkId: st.homeworkId, groupId: st.groupId, date: st.date, view: st.view });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (profile === undefined) return <div className="p-6 text-muted">Laden…</div>;
  if (!profile) return <Auth />;
  const rights = rightsFor(profile.role);
  if (rights.mustChooseRole) return <Welkom />;

  const hasDashboard = rights.studentsTitle !== null;
  const isOuder = profile.role === "ouder";
  const current: Screen = screen ?? (hasDashboard ? "overzicht" : "vandaag");
  /** de schermen van de leerling; een ouder of leraar komt hier via "Zelf oefenen" */
  const practicing = current === "vandaag" || current === "oefenen";
  const student = students.find((s) => s.id === studentId);
  const child = students.find((s) => s.id === childId);
  /** huiswerk voor meerdere leerlingen (vanuit de leerlingentabel) of voor het kind van de pagina */
  const homeworkFor = extra.studentIds?.length ? extra.studentIds : childId ? [childId] : [];
  const many = homeworkFor.length > 1;
  const onChildPage = current === "kind" || current === "dag" || current === "huiswerk";
  const inLibrary = LIBRARY.some(([s]) => s === current);
  const inGroups = current === "groep" || current === "groepnieuw" || current === "vakanties" || current === "les";
  /** naar een ander scherm, bovenaan beginnen; komt in de browsergeschiedenis */
  const go = (s: Screen, more: Partial<Omit<NavState, "screen">> = {}) => {
    const st: NavState = { screen: s, childId: more.childId ?? childId, day: more.day ?? day, from: more.from, tab: more.tab ?? extra.tab, feedbackId: more.feedbackId, studentIds: more.studentIds, bankIds: more.bankIds, taskId: more.taskId, homeworkId: more.homeworkId,
      groupId: more.groupId, date: more.date, view: more.view };
    window.history.pushState(st, "");
    setScreen(st.screen); setChildId(st.childId); setDay(st.day);
    setExtra({ from: st.from, tab: st.tab, feedbackId: st.feedbackId, studentIds: st.studentIds, bankIds: st.bankIds, taskId: st.taskId, homeworkId: st.homeworkId, groupId: st.groupId, date: st.date, view: st.view });
    window.scrollTo(0, 0);
  };
  /** een tab van de tabbalk; nog eens tikken op de tab waar je al bent doet niets */
  const practise = (m: Mode) => { if (current === "oefenen" && mode === m) return; setMode(m); go("oefenen"); };
  const studentsLabel = isOuder ? "Mijn kinderen" : "Leerlingen";
  const tabs: Tab[] = hasDashboard && !practicing && current !== "taak" && current !== "weergave" ? [
    { key: "leerlingen", label: studentsLabel, icon: "👥", onSelect: () => go("overzicht"), active: current === "overzicht" || current === "kinderen" || inGroups || (onChildPage && !(current === "huiswerk" && extra.from === "Huiswerk")) },
    { key: "huiswerk", label: "Huiswerk", icon: "📝", onSelect: () => go("geven"), active: current === "geven" || (current === "huiswerk" && extra.from === "Huiswerk") },
    { key: "bibliotheek", label: "Bibliotheek", icon: "📚", onSelect: () => go("bank"), active: inLibrary || current === "banknieuw" || current === "toewijzen" },
  ] : [
    { key: "vandaag", label: "Vandaag", icon: "☀️", onSelect: () => { if (current !== "vandaag") go("vandaag"); }, active: current === "vandaag" },
    { key: "game", label: "Spelen", icon: "🎮", onSelect: () => practise("game"), active: current === "oefenen" && mode === "game" },
    { key: "learn", label: "Grepen", icon: "🎷", onSelect: () => practise("learn"), active: current === "oefenen" && mode === "learn" },
    { key: "vrij", label: "Vrij spelen", icon: "🎙️", onSelect: () => practise("vrij"), active: current === "oefenen" && mode === "vrij" },
  ];
  /** naam van de pagina voor feedback (AC-116), zodat Alwin weet waar het over gaat */
  const pageName = ({
    vandaag: "Vandaag", overzicht: "Overzicht", kind: `Kindpagina (${child?.name ?? "?"})`, dag: `Dagpagina (${day?.date ?? "?"})`, huiswerk: "Huiswerk geven", geven: "Huiswerk: voor wie",
    oefenen: mode === "learn" ? "Grepen" : mode === "game" ? "Notenspel" : "Vrij oefenen", kinderen: rights.studentsTitle ?? "Kinderen",
    profiel: "Mijn profiel", feedback: "Feedback geven", beheer: extra.tab === "mensen" ? "Beheer: accounts" : "Beheer", feedbackdetail: "Beheer: feedback", sjablonen: "Sjablonen", boeken: "Mijn boeken", bank: "Opdrachtenbank", banknieuw: "Nieuwe opdracht in de bank", toewijzen: "Opdrachten toewijzen", taak: "Taak", weergave: "Weergave",
    groep: `Groep (${groupTitle || "?"})`, groepnieuw: "Nieuwe groep", vakanties: "Vakanties", les: `Les (${extra.date ?? "?"})`,
  } satisfies Record<Screen, string>)[current];
  const items: MenuItem[] = [
    { key: "profiel", label: "Mijn profiel", onSelect: () => go("profiel"), active: current === "profiel" },
    ...(!hasDashboard || practicing || current === "weergave" ? [{ key: "weergave", label: "Weergave", onSelect: () => go("weergave"), active: current === "weergave" }] : []),
    ...(hasDashboard ? (practicing
      ? [{ key: "terug", label: `Terug naar ${studentsLabel}`, onSelect: () => go("overzicht") }]
      : [
        { key: "kinderen", label: isOuder ? "Kind toevoegen" : "Leerling toevoegen", onSelect: () => go("kinderen"), active: current === "kinderen" },
        { key: "oefenen", label: "Zelf oefenen", onSelect: () => go("vandaag") },
      ]) : []),
    // het zwevende 💬-icoontje (AC-116) is opgegaan in het menu
    ...(profile.canGiveFeedback && current !== "feedback" ? [{ key: "feedback", label: "Feedback geven", onSelect: () => go("feedback", { from: pageName }) }] : []),
    ...(profile.role === "admin" ? [{ key: "beheer", label: "Beheer", onSelect: () => go("beheer", { tab: "feedback" }), active: current === "beheer" || current === "feedbackdetail" }] : []),
    { key: "welkom", label: "Welkomstpagina", onSelect: () => window.location.assign("/?welkom"), apart: true },
    { key: "uit", label: "Uitloggen", onSelect: () => void client.auth.signOut() },
  ];
  const subtitle = profile.role === "leerling" && student ? `leerling · ${getInstrument(student.instrumentId).name}` : profile.role ? ROLE_LABEL[profile.role] : undefined;
  const menu = <Menu name={profile.displayName || "Ik"} subtitle={subtitle} items={items} />;
  const practice = (id: string) => { selectStudent(id); go("vandaag"); };
  const studentPicker = students.length > 1 && (
    <select id="student" aria-label={isOuder ? "Kind" : "Leerling"} value={studentId ?? ""} onChange={(e) => selectStudent(e.target.value || null)}
      className="rounded-xl border-2 border-line bg-surface px-3 py-1.5 font-display font-bold">
      {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  const tabBalk = <TabBalk tabs={tabs} />;

  // eerste keer oefenen met deze leerling: even kennismaken (AC-115); ook als het kind op het toestel van de ouder speelt
  if (practicing && student && !student.onboardedAt) {
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
      <>
      <Grepentabel instrument={getInstrument(student.instrumentId)} title={hasDashboard ? `Grepen · ${student.name}` : "Grepen"}
        student={{ statuses, setStatus: (n, st) => void setStatus(n, st) }}
        // de status van een noot zetten ouder en leraar; de leerling ziet hem als label (AC-120)
        canSetStatus={profile.role !== "leerling"} onWeergave={() => go("weergave")}
        actions={studentPicker || undefined} menu={menu}
        notice={<><KoppelMelding /><NotenOvernemen /></>} />
      {tabBalk}
      </>
    );
  }

  const noStudent = (
    <div className="rounded-3xl bg-surface p-6 flex flex-col items-start gap-3">
      <p className="m-0">{isOuder ? "Voeg eerst een kind toe." : rights.canCreateStudents ? "Voeg eerst een leerling toe." : "Er is nog geen leerlingprofiel."}</p>
      {rights.studentsTitle && <Chip primary onClick={() => go("kinderen")}>{isOuder ? "+ kind" : "+ leerling"}</Chip>}
    </div>
  );
  const backTo = inGroups ? (current === "les" ? (groupTitle || "Groep") : "Groepen")
    : onChildPage || current === "feedback" || current === "feedbackdetail" || current === "banknieuw" || current === "toewijzen" || current === "taak" || current === "weergave"
    ? current === "feedback" ? (extra.from ?? "Terug") : current === "feedbackdetail" ? "Beheer" : current === "banknieuw" || current === "toewijzen" ? "Bibliotheek" : current === "taak" ? "Vandaag" : current === "weergave" ? "Terug"
      : current === "huiswerk" && extra.from ? extra.from : (current === "huiswerk" && !many) || (current === "dag" && day?.back === "kind") ? (child?.name ?? "Terug") : studentsLabel
    : null;
  const title: ReactNode | null = current === "vandaag" ? `Hoi ${(student?.userId === profile.id ? profile.displayName : student?.name ?? profile.displayName).split(" ")[0]}`
    : current === "oefenen" ? MODE_TITLE[mode]
    : current === "overzicht" ? greeting(profile.displayName) : current === "huiswerk" && extra.homeworkId ? `Huiswerk aanpassen · ${child?.name ?? ""}` : current === "huiswerk" ? `Huiswerk voor ${many ? `${homeworkFor.length} leerlingen` : (students.find((s) => s.id === homeworkFor[0])?.name ?? "")}` : onChildPage ? (child?.name ?? "")
    : current === "geven" ? "Huiswerk" : current === "kinderen" ? (rights.studentsTitle ?? "Kinderen") : current === "profiel" ? "Mijn profiel"
    : inLibrary ? "Bibliotheek"
    : current === "groep" ? groupTitle : current === "groepnieuw" ? "Nieuwe groep" : current === "vakanties" ? "Vakanties" : current === "les" ? "Les"
    : current === "banknieuw" ? "Nieuwe opdracht" : current === "taak" ? null : current === "weergave" ? "Weergave" : current === "toewijzen" ? `${extra.bankIds?.length ?? 0} ${extra.bankIds?.length === 1 ? "opdracht" : "opdrachten"} toewijzen` : current === "feedback" ? "Feedback geven" : current === "beheer" ? "Beheer" : current === "feedbackdetail" ? "Feedback" : "Notenkraker";
  /** tussen de tabbladen van de Bibliotheek wisselen vervangt het scherm in de geschiedenis */
  const swap = (s: Screen) => { window.history.replaceState({ ...window.history.state, screen: s }, ""); setScreen(s); };

  return (
    <div className={`${current === "overzicht" || current === "kind" || current === "dag" || current === "taak" ? "max-w-[1240px]" : current === "huiswerk" ? "max-w-[1480px]" : "max-w-[900px]"} mx-auto px-4 pt-6 pb-12`}>
      <header className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {backTo && (
            <button type="button" onClick={() => window.history.back()}
              className="text-sm font-semibold text-muted bg-transparent cursor-pointer mb-2 -ml-1 px-1">
              ← {backTo}
            </button>
          )}
          {/* de taakpagina zet zelf de titel van de taak neer */}
          {title !== null && <h1 className="font-display font-extrabold text-3xl sm:text-4xl leading-none">{title}</h1>}
          {current === "vandaag" && <p className="text-muted mt-1">{new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p>}
          {current === "overzicht" && <p className="text-muted mt-1">Zo ging het oefenen deze week</p>}
                  </div>
        {menu}
      </header>
      <KoppelMelding />
      <NotenOvernemen />

      {inLibrary && <div className="mb-4"><Segmented value={current} options={LIBRARY} onChange={swap} label="Bibliotheek" /></div>}
      {practicing && studentPicker && <div className="mb-3">{studentPicker}</div>}

      {current === "vandaag" && (
        <>
          {!hasBackend && <p className="text-xs text-muted border border-line rounded-lg px-3 py-2 mb-2">Zonder backend: gegevens staan alleen in deze browser. Zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env voor de echte database.</p>}
          {student
            ? <Vandaag key={student.id} student={student} onPlay={practise} onOpenTask={(t) => go("taak", { taskId: t.id, studentIds: [student.id], homeworkId: t.homeworkId })} />
            : noStudent}
        </>
      )}
      {current === "overzicht" && (
        <Dashboard onManage={() => go("kinderen")}
          onOpenChild={(id) => go("kind", { childId: id })}
          onOpenDay={(id, date) => go("dag", { childId: id, day: { date, back: "overzicht" } })}
          onGiveMany={(ids) => go("huiswerk", { studentIds: ids, childId: ids.length === 1 ? ids[0] : childId })}
          view={extra.view}
          onView={(v) => { window.history.replaceState({ ...window.history.state, view: v }, ""); setExtra((e) => ({ ...e, view: v })); }}
          onOpenGroup={(id) => go("groep", { groupId: id, view: "groepen" })}
          onNewGroup={() => go("groepnieuw", { view: "groepen" })}
          onHolidays={() => go("vakanties", { view: "groepen" })} />
      )}
      {current === "groepnieuw" && <NieuweGroep onDone={(id) => { window.history.back(); setTimeout(() => go("groep", { groupId: id, view: "groepen" }), 0); }} />}
      {current === "vakanties" && <Vakanties />}
      {current === "groep" && extra.groupId && <GroepKop groupId={extra.groupId} onTitle={setGroupTitle} />}
      {current === "kind" && childId && (
        <KindPagina studentId={childId} onPractice={() => practice(childId)} onOpenDay={(date) => go("dag", { day: { date, back: "kind" } })}
          onGiveHomework={() => go("huiswerk", { studentIds: [childId] })}
          onEditHomework={(id) => go("huiswerk", { studentIds: [childId], homeworkId: id })} />
      )}
      {current === "geven" && (
        <HuiswerkKiezen onAdd={() => go("kinderen")}
          onGive={(ids) => go("huiswerk", { studentIds: ids, childId: ids.length === 1 ? ids[0] : childId, from: "Huiswerk" })} />
      )}
      {current === "huiswerk" && homeworkFor.length > 0 && <HuiswerkGeven key={`${homeworkFor.join()}-${extra.homeworkId ?? ""}`} studentIds={homeworkFor} homeworkId={extra.homeworkId} onDone={() => window.history.back()} />}
      {current === "sjablonen" && <Sjablonen />}
      {current === "boeken" && <Boeken />}
      {current === "bank" && <Opdrachtenbank onNew={() => go("banknieuw")} onAssign={(ids) => go("toewijzen", { bankIds: ids })} />}
      {current === "banknieuw" && <NieuweBankOpdracht onDone={() => window.history.back()} />}
      {current === "toewijzen" && extra.bankIds && <Toewijzen bankIds={extra.bankIds} onDone={() => go("overzicht")} />}
      {current === "weergave" && <Weergave />}
      {current === "taak" && extra.taskId && extra.studentIds?.[0] && <Taak studentId={extra.studentIds[0]} taskId={extra.taskId} lessonId={extra.homeworkId} />}
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
      {current === "profiel" && <Profiel onLinked={() => go("vandaag")} onRedoIntake={() => go("vandaag")} />}
      {current === "oefenen" && (
        <>
          {!hasBackend && <p className="text-xs text-muted border border-line rounded-lg px-3 py-2 mb-2">Zonder backend: gegevens staan alleen in deze browser. Zet VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY in .env voor de echte database.</p>}
          {student ? (mode === "vrij" ? <VrijOefenen key={student.id} onDone={() => go("vandaag")} /> : <Game key={student.id} onDone={() => go("vandaag")} />) : noStudent}
        </>
      )}
      {tabBalk}
    </div>
  );
}
