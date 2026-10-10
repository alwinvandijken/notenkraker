// POST /invite-code — maak een code waarmee een leraar deze leerling kan koppelen.
import { clients, cors, json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { user, service } = clients(req);
  const { studentId } = await req.json();
  const { data: student } = await user.from("students").select("id").eq("id", studentId).maybeSingle();
  if (!student) return json({ error: "geen toegang" }, 403);
  const code = Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
  const { error } = await service.from("invite_codes").insert({ code, student_id: studentId });
  if (error) return json({ error: error.message }, 500);
  return json({ code });
});
