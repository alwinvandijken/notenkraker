// POST /link-student — leraar koppelt zichzelf aan een leerling via code.
import { clients, cors, json } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { user, service } = clients(req);
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return json({ error: "niet ingelogd" }, 401);
  const { data: profile } = await service.from("profiles").select("role").eq("id", me.id).maybeSingle();
  if (profile?.role !== "leraar") return json({ error: "alleen voor leraren" }, 403);
  const { code } = await req.json();
  const { data: invite } = await service.from("invite_codes").select("student_id, expires_at").eq("code", String(code).toUpperCase()).maybeSingle();
  if (!invite || new Date(invite.expires_at) < new Date()) return json({ error: "code onbekend of verlopen" }, 404);
  await service.from("teacher_students").upsert({ teacher_id: me.id, student_id: invite.student_id });
  await service.from("invite_codes").delete().eq("code", String(code).toUpperCase());
  const { data: student } = await service.from("students").select("*").eq("id", invite.student_id).single();
  return json({ student });
});
