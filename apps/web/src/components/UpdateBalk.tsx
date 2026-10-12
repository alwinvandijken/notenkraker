import { useEffect, useState } from "react";
import { appUpdate } from "@/lib/update";

/** balkje onderaan als er een nieuwe versie is; "Bijwerken" laadt hem, "Later" verbergt het balkje */
export function UpdateBalk() {
  const [ready, setReady] = useState(false);
  const [later, setLater] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => appUpdate.subscribe(setReady), []);
  if (!ready || later) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl bg-fg text-bg px-4 py-3 shadow-lg flex items-center gap-3"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <span className="flex-1 text-sm">Er is een nieuwe versie van Notenkraker.</span>
      <button type="button" onClick={() => setLater(true)} className="text-sm bg-transparent cursor-pointer text-bg/80">Later</button>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); void appUpdate.apply(); }}
        className="rounded-full bg-accent text-white px-4 py-1.5 text-sm font-semibold cursor-pointer disabled:opacity-60">{busy ? "Bijwerken…" : "Bijwerken"}</button>
    </div>
  );
}
