-- Rolmodel (AC-106)
-- 'leerling' en 'ouder' kiest de gebruiker zelf (bij registratie of na de eerste Google-login).
-- 'leraar' en 'admin' wijst Alwin toe in Supabase; niemand kan die rol zelf kiezen.
-- Een ouder maakt kinderen aan onder één login; een kind kan later met een code van de
-- ouder zijn eigen login koppelen. Een admin mag alles lezen.
-- Dicht ook een gat uit 0001: iedereen kon zijn eigen rol wijzigen of bij signup 'leraar' meesturen.

-- ── Rollen ───────────────────────────────────────────────────────────
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role drop not null;
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('leerling','ouder','leraar','admin'));
comment on column public.profiles.role is 'null = nog niet gekozen; leraar en admin alleen via beheer';

-- Alleen de naam is door de gebruiker zelf te wijzigen.
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false);
$$;

-- Eigen leerlingprofiel voor een gebruiker die zelf leerling is.
create or replace function public.create_own_student(uid uuid, student_name text)
returns void language sql security definer set search_path = public as $$
  insert into public.students (user_id, owner_id, name, instrument_id) values (uid, uid, student_name, 'altsax');
$$;
revoke execute on function public.create_own_student(uuid, text) from public, anon, authenticated;

-- Nieuwe gebruiker: alleen een zelf te kiezen rol uit de metadata overnemen.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  chosen text := case when new.raw_user_meta_data->>'role' in ('leerling','ouder') then new.raw_user_meta_data->>'role' end;
  name text := coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, role, display_name) values (new.id, chosen, name);
  if chosen = 'leerling' then perform public.create_own_student(new.id, name); end if;
  return new;
end $$;

-- Rol kiezen na de eerste Google-login. Werkt één keer.
create or replace function public.choose_role(p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  if p_role not in ('leerling','ouder') then raise exception 'rol niet toegestaan'; end if;
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'niet ingelogd'; end if;
  if me.role is not null then raise exception 'rol al gekozen'; end if;
  update public.profiles set role = p_role where id = me.id;
  if p_role = 'leerling' then perform public.create_own_student(me.id, me.display_name); end if;
end $$;
revoke execute on function public.choose_role(text) from public, anon;
grant execute on function public.choose_role(text) to authenticated;

-- ── Leerlingen aanmaken: alleen ouder en leraar, eigenaar is altijd de aanmaker ──
alter table public.students alter column owner_id set default auth.uid();
drop policy "leerlingen aanmaken" on public.students;
create policy "leerlingen aanmaken" on public.students for insert
  with check (owner_id = auth.uid() and public.my_role() in ('ouder','leraar'));
-- Lezen op de kolommen van de rij zelf: can_access_student(id) zoekt de rij op en ziet
-- een net ingevoegde rij nog niet, waardoor insert ... returning (de client) faalde.
drop policy "leerlingen lezen" on public.students;
create policy "leerlingen lezen" on public.students for select using (
  owner_id = auth.uid() or user_id = auth.uid()
  or exists (select 1 from public.teacher_students ts where ts.student_id = id and ts.teacher_id = auth.uid())
);

-- ── Uitnodigingscodes: voor een leraar of voor het kind zelf ─────────
alter table public.invite_codes add column purpose text not null default 'leraar' check (purpose in ('leraar','kind'));

create or replace function public.create_invite_code(p_student_id uuid, p_purpose text default 'leraar')
returns text language plpgsql security definer set search_path = public as $$
declare
  s public.students;
  new_code text;
begin
  if p_purpose not in ('leraar','kind') then raise exception 'onbekend doel'; end if;
  select * into s from public.students where id = p_student_id;
  if s.id is null or not public.can_access_student(s.id) then raise exception 'geen toegang'; end if;
  -- alleen de eigenaar (ouder) laat een kind zelf inloggen, en maar één keer
  if p_purpose = 'kind' and (s.owner_id <> auth.uid() or s.user_id is not null) then raise exception 'geen toegang'; end if;
  new_code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
               from (select extensions.gen_random_bytes(6) as b) r, generate_series(0, 5) i);
  insert into public.invite_codes (code, student_id, purpose) values (new_code, s.id, p_purpose);
  return new_code;
end $$;
revoke execute on function public.create_invite_code(uuid, text) from public, anon;
grant execute on function public.create_invite_code(uuid, text) to authenticated;

-- Kind koppelt zijn eigen login aan het leerlingprofiel dat de ouder aanmaakte.
create or replace function public.claim_student(p_code text)
returns public.students language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  inv public.invite_codes;
  s public.students;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if me.id is null then raise exception 'niet ingelogd'; end if;
  if me.role is not null and me.role <> 'leerling' then raise exception 'alleen voor leerlingen'; end if;
  select * into inv from public.invite_codes
    where code = upper(p_code) and purpose = 'kind' and expires_at > now() for update;
  if inv.code is null then raise exception 'code onbekend of verlopen'; end if;

  -- een eerder zelf aangemaakt, nog ongebruikt leerlingprofiel is niet meer nodig
  delete from public.students o
    where o.owner_id = me.id and o.user_id = me.id
      and not exists (select 1 from public.rounds r where r.student_id = o.id);
  update public.students set user_id = me.id where id = inv.student_id and user_id is null returning * into s;
  if s.id is null then raise exception 'code onbekend of verlopen'; end if;
  update public.profiles set role = 'leerling' where id = me.id and role is null;
  delete from public.invite_codes where code = inv.code;
  return s;
end $$;
revoke execute on function public.claim_student(text) from public, anon;
grant execute on function public.claim_student(text) to authenticated;

-- ── Admin leest alles (schrijven blijft via het dashboard) ───────────
create policy "admin leest profielen"   on public.profiles         for select using (public.is_admin());
create policy "admin leest leerlingen"  on public.students         for select using (public.is_admin());
create policy "admin leest koppelingen" on public.teacher_students for select using (public.is_admin());
create policy "admin leest noten"       on public.student_notes    for select using (public.is_admin());
create policy "admin leest rondes"      on public.rounds           for select using (public.is_admin());
create policy "admin leest liedjes"     on public.songs            for select using (public.is_admin());
create policy "admin leest pogingen"    on public.attempts         for select using (public.is_admin());
