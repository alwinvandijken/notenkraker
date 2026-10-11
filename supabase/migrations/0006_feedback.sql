-- Feedback (AC-116, mock-up docs/mockups/Feedback.html)
-- De beheerder (rol admin) zet per persoon aan wie feedback mag geven. Wie dat mag, ziet op elke
-- pagina een mini-icoontje; het formulier stuurt de pagina, het apparaat, de versie en de rol mee.
-- Alleen de beheerder leest feedback en zet de status (nieuw → bekeken → linear → klaar).

alter table public.profiles add column can_give_feedback boolean not null default false;
comment on column public.profiles.can_give_feedback is 'mag feedback geven; alleen te zetten door een admin via set_feedback_allowed';
-- (gebruikers mogen alleen display_name wijzigen, zie 0002_rollen.sql)

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  display_name text not null default '',
  role text,
  kind text not null check (kind in ('idee','fout','vraag')),
  message text not null,
  screen text not null default '',
  url text not null default '',
  device text not null default '',
  version text not null default '',
  status text not null default 'nieuw' check (status in ('nieuw','bekeken','linear','klaar')),
  linear_url text,
  created_at timestamptz not null default now()
);
create index on public.feedback (created_at desc);

alter table public.feedback enable row level security;
create policy "admin leest feedback" on public.feedback for select using (public.is_admin());
create policy "admin werkt feedback bij" on public.feedback for update using (public.is_admin());
revoke insert, delete on public.feedback from anon, authenticated;
revoke update on public.feedback from anon, authenticated;
grant update (status, linear_url) on public.feedback to authenticated;

create or replace function public.give_feedback(p_kind text, p_message text, p_screen text, p_url text, p_device text, p_version text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or not me.can_give_feedback then raise exception 'geen toegang'; end if;
  if p_kind not in ('idee','fout','vraag') or length(trim(coalesce(p_message, ''))) = 0 or length(p_message) > 4000
  then raise exception 'ongeldige feedback'; end if;
  insert into public.feedback (user_id, display_name, role, kind, message, screen, url, device, version)
  values (me.id, me.display_name, me.role, p_kind, trim(p_message), left(coalesce(p_screen, ''), 200),
          left(coalesce(p_url, ''), 500), left(coalesce(p_device, ''), 300), left(coalesce(p_version, ''), 50));
end $$;

create or replace function public.set_feedback_allowed(p_user uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'geen toegang'; end if;
  update public.profiles set can_give_feedback = coalesce(p_allowed, false) where id = p_user;
end $$;

-- alle accounts met e-mail, voor de beheerpagina
create or replace function public.admin_users()
returns table (id uuid, display_name text, email text, role text, can_give_feedback boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'geen toegang'; end if;
  return query select p.id, p.display_name, u.email::text, p.role, p.can_give_feedback, p.created_at
    from public.profiles p join auth.users u on u.id = p.id order by p.display_name;
end $$;

revoke execute on function public.give_feedback(text, text, text, text, text, text) from public, anon;
revoke execute on function public.set_feedback_allowed(uuid, boolean) from public, anon;
revoke execute on function public.admin_users() from public, anon;
grant execute on function public.give_feedback(text, text, text, text, text, text) to authenticated;
grant execute on function public.set_feedback_allowed(uuid, boolean) to authenticated;
grant execute on function public.admin_users() to authenticated;
