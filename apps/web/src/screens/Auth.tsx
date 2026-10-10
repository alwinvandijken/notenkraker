import { useState } from "react";
import type { SelfRole } from "@notenkraker/client";
import { client } from "@/lib/client";
import { Card, Chip } from "@/components/ui";

/** Inloggen/registreren: e-mail + wachtwoord of Google. Zelf te kiezen: leerling of ouder; leraren maken we samen aan. */
export function Auth() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<SelfRole>("leerling");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (mode === "login") await client.auth.signInWithPassword(email, password);
      else await client.auth.signUpWithPassword(email, password, role, name || email.split("@")[0]!);
    } catch (err) { setError(err instanceof Error ? err.message : "Inloggen mislukt"); }
    finally { setBusy(false); }
  }

  const field = "w-full rounded-xl border-2 border-line bg-bg px-3 py-2 text-fg";
  return (
    <div className="max-w-sm mx-auto mt-8">
      <h1 className="font-display font-extrabold text-4xl text-center">Notenkraker</h1>
      <p className="text-muted text-center mb-5">Noten leren lezen én spelen</p>
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
          <input id="password" className={field} type="password" placeholder="Wachtwoord" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} />
          {error && <p className="text-sm text-wrong">{error}</p>}
          <Chip type="submit" className="border-accent bg-accent text-white" disabled={busy}>{mode === "login" ? "Inloggen" : "Account maken"}</Chip>
        </form>
        <div className="text-center text-muted text-sm my-3">of</div>
        <Chip className="w-full" onClick={() => client.auth.signInWithGoogle(`${window.location.origin}/app`)}>Doorgaan met Google</Chip>
      </Card>
    </div>
  );
}
