// POST /purge-recordings — ruimt opnames op die over hun bewaartermijn zijn (4 weken na de
// einddatum van het huiswerk, AC-118). Draait elke nacht via een cron-taak. Beveiligd met de
// header x-cron-secret (Supabase secret CRON_SECRET); het bestand gaat weg uit Storage, de
// regel blijft staan met recording_deleted_at (en de reactie van de leraar).
import { createClient } from "npm:@supabase/supabase-js@2";
import { json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "geen toegang" }, 403);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: expired, error } = await service.rpc("expired_recordings");
  if (error) return json({ error: error.message }, 500);
  const rows = (expired ?? []) as Array<{ task_id: string; path: string }>;
  if (rows.length === 0) return json({ removed: 0 });

  // in porties van 100, zodat één fout niet alles tegenhoudt
  let removed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const part = rows.slice(i, i + 100);
    const { error: rmError } = await service.storage.from("opnames").remove(part.map((r) => r.path));
    if (rmError) continue;
    await service.rpc("mark_recordings_deleted", { p_tasks: part.map((r) => r.task_id) });
    removed += part.length;
  }
  return json({ removed });
});
