// POST /invite-code — maak een code voor deze leerling: om een leraar te koppelen
// (purpose 'leraar') of om het kind zelf te laten inloggen (purpose 'kind', alleen de ouder).
// De regels staan in de RPC create_invite_code (supabase/migrations/0002_rollen.sql).
import { clients, cors, json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { user } = clients(req);
  const { studentId, purpose = "leraar" } = await req.json();
  const { data: code, error } = await user.rpc("create_invite_code", { p_student_id: studentId, p_purpose: purpose });
  if (error) return json({ error: error.message }, error.message === "geen toegang" ? 403 : 400);
  return json({ code });
});
