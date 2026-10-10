import { useEffect, useState } from "react";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { importableNotes, markImportAsked, offerImport } from "@/lib/route";
import { Chip } from "@/components/ui";

/**
 * Een nieuw account begint leeg (besluit Alwin, AC-114). Staan er noten van "zonder account" op
 * dit apparaat en heeft de leerling in zijn account nog geen noten, dan vragen we één keer of
 * die mee moeten. Alleen de notenstatus; rondes en oefentijd zonder account gaan niet mee.
 */
export function NotenOvernemen() {
  const { profile, studentId, students } = useApp();
  const own = students.find((s) => s.id === studentId && s.userId === profile?.id);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stale = false;
    setShow(false);
    if (profile?.role !== "leerling" || !own) return;
    void client.notes.list(own.id).then((notes) => { if (!stale) setShow(offerImport(localStorage, notes.length)); });
    return () => { stale = true; };
  }, [profile?.role, own]);

  if (!show || !own) return null;
  const notes = importableNotes(localStorage);
  const done = () => { markImportAsked(localStorage); setShow(false); };
  async function take() {
    setBusy(true);
    for (const n of notes) await client.notes.setStatus(own!.id, n.noteId, n.status);
    useApp.getState().selectStudent(own!.id); // statussen opnieuw laden
    done();
  }
  return (
    <section role="status" className="rounded-3xl bg-surface border-2 border-kent p-4 mb-4 flex flex-col gap-3">
      <b className="font-display text-lg">Noten van dit apparaat overnemen?</b>
      <p className="m-0 text-sm text-muted">Zonder account heb je op dit apparaat {notes.length} {notes.length === 1 ? "noot" : "noten"} een status gegeven. Wil je die in je nieuwe account?</p>
      <div className="flex flex-wrap gap-2">
        <Chip primary disabled={busy} onClick={() => void take()}>Ja, overnemen</Chip>
        <Chip disabled={busy} onClick={done}>Nee, leeg beginnen</Chip>
      </div>
    </section>
  );
}
