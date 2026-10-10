import { useState } from "react";
import { rightsFor } from "@notenkraker/client";
import { client, hasBackend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Card, Chip } from "@/components/ui";

const ROLE_LABEL = { leerling: "Leerling", ouder: "Ouder", leraar: "Leraar", admin: "Beheerder" } as const;

/** "Mijn profiel": wie je bent, en voor een leerling alsnog koppelen met een code van de ouder. */
export function Profiel({ onLinked, onRedoIntake }: { onLinked(): void; onRedoIntake(): void }) {
  const profile = useApp((s) => s.profile);
  const claimByCode = useApp((s) => s.claimByCode);
  const { students, loadStudents } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const rights = rightsFor(profile.role);
  const own = students.find((s) => s.userId === profile.id);
  /** de kennismaking opnieuw: alles opnieuw vragen, bij de volgende keer oefenen */
  async function redo() {
    if (!own) return;
    await client.students.update(own.id, { ageBand: null, experience: null, onboardedAt: null });
    await loadStudents();
    onRedoIntake();
  }

  async function koppel(e: React.FormEvent) {
    e.preventDefault(); if (!code) return;
    setBusy(true);
    const ok = await claimByCode(code);
    setBusy(false);
    if (ok) { setCode(""); onLinked(); }
  }

  return (
    <div className="flex flex-col gap-3 mt-5 max-w-lg">
      <h2 className="font-display font-bold text-2xl m-0">Mijn profiel</h2>
      <Card className="!p-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 m-0">
          <dt className="text-muted">Naam</dt><dd className="m-0 font-semibold">{profile.displayName}</dd>
          {profile.email && <><dt className="text-muted">E-mail</dt><dd className="m-0">{profile.email}</dd></>}
          <dt className="text-muted">Rol</dt><dd className="m-0">{profile.role ? ROLE_LABEL[profile.role] : "nog niet gekozen"}</dd>
          {own?.ageBand && <><dt className="text-muted">Leeftijd</dt><dd className="m-0">{own.ageBand === "18+" ? "18 jaar of ouder" : `${own.ageBand.replace("-", " – ")} jaar`}</dd></>}
        </dl>
        {own && <button type="button" onClick={() => void redo()} className="mt-3 text-sm font-semibold text-kent bg-transparent cursor-pointer px-0">Leeftijd en noten opnieuw doen →</button>}
      </Card>
      {rights.canClaimByCode && hasBackend && (
        <Card className="!p-4 flex flex-col gap-2">
          <b className="font-display">Koppelen met code van ouder</b>
          <form className="flex gap-2" onSubmit={koppel}>
            <input id="claimCode" aria-label="Code van je ouder" placeholder="Code van je ouder" value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="flex-1 rounded-xl border-2 border-line bg-bg px-3 py-2 font-mono" />
            <Chip type="submit" disabled={busy || !code}>Koppel</Chip>
          </form>
          <p className="text-xs text-muted m-0">Je oefent dan verder met het profiel dat je ouder voor je maakte. Je eigen, nog lege profiel verdwijnt.</p>
        </Card>
      )}
      <Chip className="self-start" onClick={() => void client.auth.signOut()}>Uitloggen</Chip>
    </div>
  );
}
