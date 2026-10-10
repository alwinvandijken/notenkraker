import type { NoteId, NoteStatus } from "@notenkraker/core";

/**
 * Twee manieren om Notenkraker te gebruiken (AC-114, mock-up docs/mockups/Welkom-Twee-Routes.html):
 * `/` is de welkomstpagina, `/oefenen` is zonder account (alles in deze browser), `/app` is met
 * een gratis account. Met "niet meer tonen" slaat `/` de welkomstpagina over en gaat direct naar
 * de laatst gekozen route; `/?welkom` toont hem altijd (zo komt het menu er terug).
 */
export type AppKind = "welkom" | "anoniem" | "account";
export type Route = "oefenen" | "app";

const ROUTE = "nk.route";
const SKIP = "nk.welkom.overslaan";
/** opslag van de route zonder account (createLocalNotenkraker) */
export const ANONIEM_KEY = "nk-anoniem";
const IMPORT_ASKED = "nk.overnemen.gevraagd";

export function appFor(pathname: string): AppKind {
  if (pathname.startsWith("/app")) return "account";
  if (pathname.startsWith("/oefenen")) return "anoniem";
  return "welkom";
}

export function chooseRoute(storage: Storage, route: Route, skipWelcome: boolean) {
  storage.setItem(ROUTE, route);
  if (skipWelcome) storage.setItem(SKIP, "1"); else storage.removeItem(SKIP);
}

/** waar `/` naartoe moet, of null om de welkomstpagina te tonen */
export function redirectFor(pathname: string, search: string, storage: Storage): string | null {
  if (appFor(pathname) !== "welkom" || new URLSearchParams(search).has("welkom")) return null;
  if (storage.getItem(SKIP) !== "1") return null;
  const route = storage.getItem(ROUTE);
  return route === "oefenen" || route === "app" ? `/${route}` : null;
}

/** de noten die zonder account op dit apparaat staan */
export function importableNotes(storage: Storage): Array<{ noteId: NoteId; status: NoteStatus }> {
  try {
    const state = JSON.parse(storage.getItem(ANONIEM_KEY) ?? "null") as
      { students?: Array<{ id: string }>; notes?: Array<{ studentId: string; noteId: NoteId; status: NoteStatus }> } | null;
    // zonder account is er één profiel; is er per ongeluk een tweede, dan telt alleen het eerste
    const first = state?.students?.[0]?.id;
    return (state?.notes ?? []).filter((n) => n.studentId === first).map(({ noteId, status }) => ({ noteId, status }));
  } catch { return []; }
}

/** een nieuw account begint leeg; vraag één keer of de noten van dit apparaat mee moeten */
export function offerImport(storage: Storage, accountNotes: number): boolean {
  return accountNotes === 0 && storage.getItem(IMPORT_ASKED) !== "1" && importableNotes(storage).length > 0;
}

export function markImportAsked(storage: Storage) { storage.setItem(IMPORT_ASKED, "1"); }
