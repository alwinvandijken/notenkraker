/**
 * Uitnodigingslink voor een kind: /app?koppel=CODE. De code wordt onthouden in
 * localStorage, zodat hij het inloggen bij Google (een redirect) of een
 * bevestigingsmail in een nieuw tabblad overleeft. Na het inloggen koppelt de
 * store het kind met claim_student (zie store.claimPendingInvite).
 */
type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = "nk.koppel";

export function inviteLink(origin: string, code: string): string {
  return `${origin}/app?koppel=${encodeURIComponent(code)}`;
}

/** Onthoudt de code uit de URL; geeft de URL zonder code terug, of null als er geen code in stond. */
export function takeInviteFromUrl(url: URL, store: KeyStore): string | null {
  const code = url.searchParams.get("koppel");
  if (!code) return null;
  store.setItem(KEY, code.trim().toUpperCase());
  url.searchParams.delete("koppel");
  return url.pathname + url.search + url.hash;
}

export function pendingInvite(store: KeyStore): string | null {
  return store.getItem(KEY);
}

export function clearInvite(store: KeyStore): void {
  store.removeItem(KEY);
}

/** Melding voor een mislukte koppeling; de teksten komen uit claim_student (0002_rollen.sql). */
export function koppelFout(err: unknown): string {
  const msg = (err as { message?: string } | null)?.message ?? "";
  if (msg.includes("code onbekend of verlopen")) return "Deze link of code werkt niet meer: hij is al gebruikt of verlopen. Vraag je ouder om een nieuwe.";
  if (msg.includes("alleen voor leerlingen")) return "Deze link is voor het kind. Log in met het account van je kind om te koppelen.";
  return "Koppelen lukte niet. Probeer het opnieuw.";
}
