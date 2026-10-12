/**
 * Notenkraker zonder account op /oefenen (AC-114, mock-up docs/mockups/Welkom-Twee-Routes.html).
 * Dezelfde tabbalk en hetzelfde Vandaag als met account (AC-120), zonder huiswerk: Vandaag, Spelen, Grepen en Vrij spelen. Alles staat in
 * deze browser (lokale client, zie lib/client.ts); geen ouder, leraar of huiswerk. Een gratis account
 * maken kan altijd via het avatarmenu en op momenten waar het uitmaakt.
 */
import { useEffect, useState } from "react";
import type { StatusMap } from "@notenkraker/core";
import { getInstrument } from "@notenkraker/instruments";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { chooseRoute } from "@/lib/route";
import { ICON } from "@/lib/iconen";
import { Grepentabel } from "@/screens/Grepentabel";
import { Game } from "@/screens/Game";
import { VrijOefenen } from "@/screens/VrijOefenen";
import { Kennismaking } from "@/screens/Kennismaking";
import { Vandaag, type Mode } from "@/screens/Vandaag";
import { Weergave } from "@/screens/Weergave";
import { Menu, type MenuItem } from "@/components/Menu";
import { TabBalk, type Tab } from "@/components/TabBalk";

type Screen = "start" | "grepen" | "spel" | "vrij" | "weergave";
const SCREENS: Screen[] = ["start", "grepen", "spel", "vrij", "weergave"];
const TITLES: Record<Exclude<Screen, "start">, string> = { grepen: "Grepen", spel: "Spelen", vrij: "Vrij spelen", weergave: "Weergave" };
const SCREEN_FOR: Record<Mode, Exclude<Screen, "start" | "weergave">> = { learn: "grepen", game: "spel", vrij: "vrij" };
/** het proefconcept (AC-107) bewaarde de notenstatus hier; die nemen we één keer over */
const POC_KEY = "nk.poc.altsax.status";

/** eerste keer zonder account: een leerlingprofiel "Ik", met de noten uit het proefconcept als die er zijn */
let ensuring: Promise<void> | null = null;
/** één keer per pagina, ook als React het effect twee keer draait (StrictMode) */
const ensureStudent = () => (ensuring ??= createStudentOnce());
async function createStudentOnce() {
  if ((await client.students.list()).length > 0) return;
  const me = await client.students.create({ name: "Ik", instrumentId: "altsax" });
  // de notenstatus uit het proefconcept; verder bepaalt de kennismaking de noten
  let poc: StatusMap = {};
  try { poc = JSON.parse(localStorage.getItem(POC_KEY) ?? "{}") as StatusMap; } catch { /* niets over te nemen */ }
  for (const [noteId, status] of Object.entries(poc)) await client.notes.setStatus(me.id, noteId, status);
}

const screenFromState = (): Screen => {
  const s = window.history.state?.anoniem as Screen | undefined;
  return s && SCREENS.includes(s) ? s : "start";
};

export function AnoniemApp() {
  const { profile, students, studentId, statuses, init, setStatus, loadStudents } = useApp();
  const [screen, setScreen] = useState<Screen>(screenFromState);
  const [ready, setReady] = useState(false);

  useEffect(() => { void ensureStudent().then(init).then(() => setReady(true)); }, [init]);
  // terug in de browser (of terugvegen op de iPhone) blijft in de app
  useEffect(() => {
    const onPop = () => setScreen(screenFromState());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (s: Screen) => { window.history.pushState({ anoniem: s }, ""); setScreen(s); window.scrollTo(0, 0); };
  const toAccount = (path: string) => { try { chooseRoute(localStorage, "app", false); } catch { /* geen opslag */ } window.location.assign(path); };

  const student = students.find((s) => s.id === studentId);
  if (!ready || !profile || !student) return <div className="p-6 text-muted">Laden…</div>;

  const items: MenuItem[] = [
    { key: "weergave", label: "Weergave", onSelect: () => go("weergave"), active: screen === "weergave" },
    { key: "account", label: "Gratis account maken", onSelect: () => toAccount("/app?nieuw") },
    { key: "login", label: "Inloggen", onSelect: () => toAccount("/app") },
    { key: "welkom", label: "Welkomstpagina", onSelect: () => window.location.assign("/?welkom"), apart: true },
  ];
  const menu = <Menu name="Ik" subtitle={`zonder account · ${getInstrument(student.instrumentId).name}`} items={items} />;
  /** nog eens tikken op de tab waar je al bent doet niets */
  const tab = (s: Screen, label: string, icon: string): Tab => ({ key: s, label, icon, active: screen === s, onSelect: () => { if (screen !== s) go(s); } });
  const tabBalk = <TabBalk tabs={[tab("start", "Vandaag", "☀️"), tab("spel", "Spelen", ICON.spel), tab("grepen", "Grepen", ICON.vrij), tab("vrij", "Vrij spelen", "🎙️")]} />;
  const nudge = (text: string) => (
    <div className="rounded-2xl bg-bg p-4 text-sm text-left flex flex-col gap-2 w-full">
      <span className="text-muted">{text}</span>
      <button type="button" onClick={() => toAccount("/app?nieuw")} className="self-start font-semibold text-kent bg-transparent cursor-pointer">Gratis account maken →</button>
    </div>
  );

  // eerste keer: even kennismaken (AC-115)
  if (!student.onboardedAt) {
    return (
      <div className="max-w-[900px] mx-auto px-4 pt-5 pb-12 flex flex-col gap-4">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 font-display font-extrabold text-xl"><span className="w-9 h-9 rounded-xl bg-fg text-bg flex items-center justify-center" aria-hidden="true">♪</span>Notenkraker</div>
          {menu}
        </header>
        <Kennismaking student={student} statuses={statuses} onDone={() => void loadStudents().then(() => go("start"))} />
      </div>
    );
  }

  if (screen === "grepen") {
    return (
      <>
      <Grepentabel instrument={getInstrument(student.instrumentId)} title="Grepen"
        student={{ statuses, setStatus: (n, st) => void setStatus(n, st) }}
        onWeergave={() => go("weergave")} menu={menu} />
      {tabBalk}
      </>
    );
  }

  return (
    <div className="max-w-[900px] mx-auto px-4 pt-5 pb-12 flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {screen === "weergave" && (
            <button type="button" onClick={() => window.history.back()} className="text-sm font-semibold text-muted bg-transparent cursor-pointer mb-2 -ml-1 px-1">← Terug</button>
          )}
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl leading-none m-0">{screen === "start" ? "Hoi!" : TITLES[screen]}</h1>
          {screen === "start" && <p className="text-muted mt-1 mb-0">{new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</p>}
        </div>
        {menu}
      </header>

      {screen === "start" && (
        <Vandaag student={student} withHomework={false} onPlay={(m) => go(SCREEN_FOR[m])}
          footer={<div className="rounded-3xl bg-accent-soft p-4 text-sm flex flex-col gap-1.5">
            <span>Met een gratis account bewaar je je voortgang en kijken ouder en leraar mee.</span>
            <button type="button" onClick={() => toAccount("/app?nieuw")} className="self-start font-semibold text-accent bg-transparent cursor-pointer p-0">Account maken →</button>
          </div>} />
      )}
      {screen === "weergave" && <Weergave />}
      {screen === "spel" && <Game onDone={() => go("start")} />}
      {screen === "vrij" && <VrijOefenen onDone={() => go("start")} after={nudge("Wil je dat je ouder of leraar dit ziet? Met een gratis account bewaar je je oefentijd en kijken zij mee.")} />}
      {tabBalk}
    </div>
  );
}
