import { useState } from "react";
import type { FeedbackKind } from "@notenkraker/client";
import { client } from "@/lib/client";
import { deviceLabel } from "@/lib/feedback";
import { useApp } from "@/lib/store";
import { Chip, Segmented } from "@/components/ui";

/**
 * Feedback geven (AC-116, mock-up docs/mockups/Feedback.html), een eigen pagina. Je komt hier via
 * het mini-icoontje; de pagina waar je was (`screen`) gaat mee, net als apparaat, versie en rol.
 */
export const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";

export function FeedbackGeven({ screen, onDone }: { screen: string; onDone(): void }) {
  const { profile } = useApp();
  const [kind, setKind] = useState<FeedbackKind>("idee");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"invullen" | "bezig" | "klaar" | "fout">("invullen");
  const device = deviceLabel(navigator.userAgent, window.innerWidth, navigator.maxTouchPoints);

  const send = async () => {
    setState("bezig");
    try {
      await client.feedback.send({ kind, message: message.trim(), screen, url: window.location.pathname, device, version: APP_VERSION });
      setState("klaar");
    } catch { setState("fout"); }
  };

  if (state === "klaar") {
    return (
      <div className="rounded-3xl bg-surface p-6 flex flex-col items-center gap-3 text-center max-w-[640px]">
        <div className="text-5xl" aria-hidden="true">🙏</div>
        <h2 className="font-display font-bold text-2xl m-0">Bedankt!</h2>
        <p className="text-muted m-0">Je feedback is binnen. Zo wordt Notenkraker steeds beter.</p>
        <Chip primary onClick={onDone}>Terug naar {screen}</Chip>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-[640px]">
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Wat wil je kwijt?</span>
        <Segmented value={kind} onChange={setKind} label="Soort feedback"
          options={[["idee", "💡 Idee"], ["fout", "🐞 Werkt niet"], ["vraag", "❓ Vraag"]]} />
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} maxLength={4000} aria-label="Je feedback" autoFocus
          placeholder={kind === "fout" ? "Wat deed je, en wat ging er mis?" : kind === "vraag" ? "Wat wil je weten?" : "Wat zou beter of leuker zijn?"}
          className="w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-[15px] resize-y" />
      </section>
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Wordt meegestuurd</span>
        <span className="text-sm text-muted">Pagina: {screen} · {device} · versie {APP_VERSION}{profile?.role ? ` · ${profile.role}` : ""}</span>
      </section>
      {state === "fout" && <p className="text-sm text-wrong m-0">Versturen lukte niet. Probeer het nog een keer.</p>}
      <Chip primary disabled={!message.trim() || state === "bezig"} onClick={() => void send()} className="py-3 text-lg">
        {state === "bezig" ? "Versturen…" : "Versturen"}
      </Chip>
    </div>
  );
}

/** het mini-icoontje rechtsonder op elke pagina, alleen voor wie feedback mag geven */
export function FeedbackKnop({ onOpen }: { onOpen(): void }) {
  return (
    <button type="button" onClick={onOpen} aria-label="Feedback geven over deze pagina" title="Feedback geven"
      className="fixed right-3 bottom-3 z-30 w-10 h-10 rounded-full bg-fg text-bg text-lg flex items-center justify-center shadow-md opacity-80 hover:opacity-100 cursor-pointer"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <span aria-hidden="true">💬</span>
    </button>
  );
}
