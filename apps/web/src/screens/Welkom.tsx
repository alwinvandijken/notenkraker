import { useState } from "react";
import type { SelfRole } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Card, Chip } from "@/components/ui";

/** Na de eerste Google-login: leerling of ouder kiezen, of als kind een code van de ouder invoeren. */
export function Welkom() {
  const refreshProfile = useApp((s) => s.refreshProfile);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setError(""); setBusy(true);
    try { await action(); await refreshProfile(); }
    catch (err) { setError(err instanceof Error ? err.message : "Dat lukte niet"); }
    finally { setBusy(false); }
  }
  const choose = (role: SelfRole) => run(() => client.auth.chooseRole(role));

  return (
    <div className="max-w-sm mx-auto mt-8">
      <h1 className="font-display font-extrabold text-4xl text-center">Welkom!</h1>
      <p className="text-muted text-center mb-5">Wie ben jij?</p>
      <Card>
        <div className="flex flex-col gap-2">
          <Chip disabled={busy} onClick={() => choose("leerling")}>Ik ben leerling</Chip>
          <Chip disabled={busy} onClick={() => choose("ouder")}>Ik ben ouder</Chip>
        </div>
        <div className="text-center text-muted text-sm my-3">of</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code) void run(() => client.students.claimByCode(code)); }}>
          <input id="claimCode" aria-label="Code van je ouder" placeholder="Code van je ouder" value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2 text-fg" />
          <Chip type="submit" disabled={busy || !code}>Koppel</Chip>
        </form>
        {error && <p className="text-sm text-wrong mt-3">{error}</p>}
        <p className="text-xs text-muted mt-4">Ben je leraar? Dan maken we je account samen aan.</p>
      </Card>
    </div>
  );
}
