import { useState } from "react";
import type { SelfRole } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { KoppelMelding } from "@/components/KoppelMelding";
import { Card, Chip } from "@/components/ui";

/**
 * Na de eerste Google-login: als kind een code van de ouder invoeren, of leerling of ouder kiezen.
 * De code staat bovenaan: een kind met een code hoeft geen rol te kiezen. Met een uitnodigingslink
 * komt een kind hier niet, want de store koppelt dan al na het inloggen.
 */
export function Welkom() {
  const refreshProfile = useApp((s) => s.refreshProfile);
  const claimByCode = useApp((s) => s.claimByCode);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function choose(role: SelfRole) {
    setError(""); setBusy(true);
    try { await client.auth.chooseRole(role); await refreshProfile(); }
    catch (err) { setError(err instanceof Error ? err.message : "Dat lukte niet"); }
    finally { setBusy(false); }
  }
  async function koppel(e: React.FormEvent) {
    e.preventDefault(); if (!code) return;
    setBusy(true); await claimByCode(code); setBusy(false);
  }

  return (
    <div className="max-w-sm mx-auto mt-8 px-4">
      <h1 className="font-display font-extrabold text-4xl text-center">Welkom!</h1>
      <KoppelMelding />
      <Card>
        <b className="font-display">Heb je een code van je ouder?</b>
        <form className="flex gap-2 mt-2" onSubmit={koppel}>
          <input id="claimCode" aria-label="Code van je ouder" placeholder="Code" value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="flex-1 min-w-0 rounded-xl border-2 border-line bg-bg px-3 py-2 text-fg font-mono" />
          <Chip type="submit" disabled={busy || !code}>Koppel</Chip>
        </form>
      </Card>
      <div className="text-center text-muted text-sm my-3">of, wie ben jij?</div>
      <Card>
        <div className="flex flex-col gap-2">
          <Chip disabled={busy} onClick={() => void choose("leerling")}>Ik ben leerling</Chip>
          <Chip disabled={busy} onClick={() => void choose("ouder")}>Ik ben ouder</Chip>
        </div>
        {error && <p className="text-sm text-wrong mt-3">{error}</p>}
        <p className="text-xs text-muted mt-4">Ben je leraar? Dan maken we je account samen aan.</p>
      </Card>
    </div>
  );
}
