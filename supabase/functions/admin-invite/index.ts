// POST /admin-invite — de beheerder maakt vanuit de app een account aan (Beheer → Accounts).
// Body: { email, displayName, role: 'leerling'|'ouder'|'leraar', redirectTo }. De persoon krijgt een
// uitnodiging per mail met een inloglink; een wachtwoord is niet nodig. Alleen voor rol admin.
import { clients, cors, json } from "../_shared/supabase.ts";

const ROLES = ["leerling", "ouder", "leraar"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const { user, service } = clients(req);
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return json({ error: "niet ingelogd" }, 401);
  const { data: myProfile } = await service.from("profiles").select("role").eq("id", me.id).maybeSingle();
  if (myProfile?.role !== "admin") return json({ error: "geen toegang" }, 403);

  const { email, displayName, role, redirectTo } = await req.json();
  const address = String(email ?? "").trim().toLowerCase();
  const name = String(displayName ?? "").trim().slice(0, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || !ROLES.includes(role)) return json({ error: "ongeldig" }, 400);

  // leerling en ouder neemt handle_new_user over uit de metadata (leerling krijgt meteen een leerlingprofiel)
  const { data, error } = await service.auth.admin.inviteUserByEmail(address, {
    data: { display_name: name || address.split("@")[0], ...(role !== "leraar" ? { role } : {}) },
    redirectTo: typeof redirectTo === "string" ? redirectTo : undefined,
  });
  if (error) return json({ error: /already|registered|exists/i.test(error.message) ? "bestaat al" : error.message }, 400);

  // leraar kan niemand zelf kiezen: dat zet de beheerder hier
  if (role === "leraar") await service.from("profiles").update({ role: "leraar" }).eq("id", data.user.id);
  return json({ id: data.user.id });
});
