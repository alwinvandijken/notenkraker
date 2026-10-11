import { useState } from "react";
import type { SelfRole } from "@notenkraker/client";
import { client } from "@/lib/client";
import { Card, Chip } from "@/components/ui";
import { pendingInvite } from "@/lib/koppel";

/**
 * Inloggen/registreren: e-mail + wachtwoord, een inloglink per mail (geen wachtwoord, handig voor
 * wie geen Google heeft) of Google. Zelf te kiezen: leerling of ouder; leraar maakt de beheerder
 * iemand in Beheer. /app?nieuw (knop "Gratis account maken" op de welkomstpagina) begint bij
 * account maken.
 */
export function Auth() {
  const [mode, setMode] = useState<"login" | "signup" | "link">(() => (new URLSearchParams(window.location.search).has("nieuw") ? "signup" : "login"));
  const [role, setRole] = useState<SelfRole>("leerling");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "link") { await client.auth.signInWithEmailLink(email, `${window.location.origin}/app`); setSent(true); }
      else if (mode === "login") await client.auth.signInWithPassword(email, password);
      else await client.auth.signUpWithPassword(email, password, role, name || email.split("@")[0]!);
    } catch (err) { setError(linkError(err) ?? (err instanceof Error ? err.message : "Inloggen mislukt")); }
    finally { setBusy(false); }
  }

  const field = "w-full rounded-xl border-2 border-line bg-bg px-3 py-2 text-fg";
  return (
    <div className="max-w-sm mx-auto mt-6 px-4">
      <a href="/?welkom" className="text-sm font-semibold text-muted no-underline">← Welkom</a>
      <h1 className="font-display font-extrabold text-4xl text-center mt-3">{mode === "signup" ? "Gratis account" : "Notenkraker"}</h1>
      <p className="text-muted text-center mb-5">{mode === "signup" ? "Je voortgang op elk apparaat; ouder en leraar kijken mee" : "Noten leren lezen én spelen"}</p>
      {pendingInvite(localStorage) && <p role="status" className="rounded-2xl border-2 border-kent px-4 py-3 mb-3 text-sm">Je ouder heeft je uitgenodigd. Log in, dan koppelen we je eigen account.</p>}
      <Card>
        <div className="flex gap-2 justify-center mb-4">
          <Chip active={mode === "login"} onClick={() => setMode("login")}>Inloggen</Chip>
          <Chip active={mode === "signup"} onClick={() => setMode("signup")}>Account maken</Chip>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === "signup" && (
            <>
              <div className="flex gap-2 justify-center">
                <Chip active={role === "leerling"} onClick={() => setRole("leerling")}>Ik ben leerling</Chip>
                <Chip active={role === "ouder"} onClick={() => setRole("ouder")}>Ik ben ouder</Chip>
              </div>
              <input id="name" className={field} placeholder="Naam" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </>
          )}
          <input id="email" className={field} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          {mode !== "link" && <input id="password" className={field} type="password" placeholder="Wachtwoord" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} />}
          {mode === "link" && sent && <p role="status" className="text-sm rounded-xl bg-ok/10 text-ok px-3 py-2 m-0">Kijk in je mail ({email}) en tik op de link. Je kunt dit venster sluiten.</p>}
          {error && <p className="text-sm text-wrong">{error}</p>}
          <Chip type="submit" primary disabled={busy}>{mode === "link" ? (sent ? "Stuur opnieuw" : "Stuur me een inloglink") : mode === "login" ? "Inloggen" : "Account maken"}</Chip>
        </form>
        <button type="button" onClick={() => { setMode(mode === "link" ? "login" : "link"); setSent(false); setError(""); }}
          className="w-full text-sm font-semibold text-kent bg-transparent cursor-pointer mt-3">
          {mode === "link" ? "Toch met wachtwoord" : "Geen wachtwoord? Stuur me een inloglink"}
        </button>
        <div className="text-center text-muted text-sm my-3">of</div>
        <Chip className="w-full" onClick={() => client.auth.signInWithGoogle(`${window.location.origin}/app`)}>Doorgaan met Google</Chip>
      </Card>
    </div>
  );
}

/** een begrijpelijke melding als Supabase te veel mails heeft verstuurd */
function linkError(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : "";
  return /rate limit|too many|seconds/i.test(msg) ? "Er is net al een link gestuurd. Wacht even en probeer het dan opnieuw." : null;
}
