-- Meerdere opnames per opdracht (AC-121). Een leerling neemt een stuk vaker op, bijvoorbeeld aan het
-- begin en aan het eind van de week; elke opname blijft staan en krijgt een eigen reactie.
-- - task_recordings: één regel per ingestuurde opname. Lezen: wie bij de leerling mag (can_access_student).
--   Schrijven alleen via de functies hieronder.
-- - Weggooien: de leerling (of de ouder die het profiel beheert) gooit een mislukte opname weg.
-- - Reageren: alleen wie het huiswerk gaf, per opname.
-- - Bewaren: zoals in 0011, 4 weken na de einddatum (purge-recordings).
--
-- Achterwaarts: develop en productie delen deze database, en de app op productie leest nog
-- homework_tasks.recording_path. Die kolommen blijven de laatste opname volgen. Een bestand dat nog in
-- task_recordings staat, kan niet uit Storage verdwijnen (de oude app gooide de vorige opname weg).

create table public.task_recordings (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.homework_tasks(id) on delete cascade,
  -- null zodra de bewaartermijn voorbij is (het bestand is dan weg)
  path text,
  submitted_at timestamptz not null default now(),
  deleted_at timestamptz,
  reaction_emoji text not null default '',
  reaction text not null default '',
  reacted_at timestamptz
);
create index task_recordings_task on public.task_recordings (task_id, submitted_at);
create index task_recordings_path on public.task_recordings (path) where path is not null;
comment on table public.task_recordings is 'ingestuurde opnames per opdracht, elk met een eigen reactie (AC-121)';

alter table public.task_recordings enable row level security;
create policy "opnames lezen" on public.task_recordings for select to authenticated
  using (exists (select 1 from public.homework_tasks t join public.homework h on h.id = t.homework_id
                 where t.id = task_id and (public.can_access_student(h.student_id) or public.is_admin())));

-- de opnames die er al zijn (één per opdracht), met hun reactie
insert into public.task_recordings (task_id, path, submitted_at, deleted_at, reaction_emoji, reaction, reacted_at)
select id, recording_path, coalesce(submitted_at, now()), recording_deleted_at, reaction_emoji, reaction, reacted_at
from public.homework_tasks where recording_path is not null or submitted_at is not null;

-- ── Storage: een bestand dat nog bij een opname hoort, blijft staan ─────
drop policy "opname verwijderen" on storage.objects;
create policy "opname verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'opnames' and public.can_access_student(public.uuid_or_null((storage.foldername(name))[1]))
         and not exists (select 1 from public.task_recordings r where r.path = name));

-- homework_tasks volgt de laatste opname (voor de app op productie, zie boven)
create or replace function public.sync_latest_recording(p_task uuid)
returns void language sql security definer set search_path = public as $$
  update public.homework_tasks t set
    recording_path = l.path, submitted_at = l.submitted_at, recording_deleted_at = l.deleted_at,
    reaction_emoji = coalesce(l.reaction_emoji, ''), reaction = coalesce(l.reaction, ''), reacted_at = l.reacted_at
  from (select null::int) x
  left join lateral (select * from public.task_recordings r where r.task_id = p_task order by r.submitted_at desc limit 1) l on true
  where t.id = p_task;
$$;
revoke execute on function public.sync_latest_recording(uuid) from public, anon, authenticated;

-- ── Insturen: een nieuwe opname komt erbij (vervangt niets meer) ──────
create or replace function public.submit_recording(p_task uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.homework_tasks; s public.students;
begin
  select tt.* into t from public.homework_tasks tt where tt.id = p_task;
  select ss.* into s from public.students ss join public.homework h on h.student_id = ss.id where h.id = t.homework_id;
  if t.id is null or auth.uid() is null or auth.uid() not in (s.user_id, s.owner_id) then raise exception 'geen toegang'; end if;
  if not t.recording then raise exception 'geen opname gevraagd'; end if;
  if not public.may_record(s.id) then raise exception 'geen toestemming'; end if;
  if p_path is null or not starts_with(p_path, s.id::text || '/' || t.id::text || '/') then raise exception 'ongeldige opname'; end if;
  insert into public.task_recordings (task_id, path) values (p_task, p_path);
  perform public.sync_latest_recording(p_task);
end $$;

-- ── Weggooien door de leerling; geeft het pad terug, de app haalt daarna het bestand weg ──
create or replace function public.delete_recording(p_recording uuid)
returns text language plpgsql security definer set search_path = public as $$
declare r public.task_recordings; s public.students;
begin
  select rr.* into r from public.task_recordings rr where rr.id = p_recording;
  select ss.* into s from public.students ss join public.homework h on h.student_id = ss.id
    join public.homework_tasks t on t.homework_id = h.id where t.id = r.task_id;
  if r.id is null or auth.uid() is null or auth.uid() not in (s.user_id, s.owner_id) then raise exception 'geen toegang'; end if;
  delete from public.task_recordings where id = p_recording;
  perform public.sync_latest_recording(r.task_id);
  return r.path;
end $$;

-- ── Reageren op één opname ───────────────────────────────────────────
create or replace function public.react_to_recording(p_recording uuid, p_emoji text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  select r.task_id into tid from public.task_recordings r join public.homework_tasks t on t.id = r.task_id
    join public.homework h on h.id = t.homework_id where r.id = p_recording and h.given_by = auth.uid();
  if tid is null then raise exception 'geen toegang'; end if;
  update public.task_recordings set reaction_emoji = left(coalesce(p_emoji, ''), 16), reaction = left(coalesce(p_text, ''), 1000), reacted_at = now()
    where id = p_recording;
  perform public.sync_latest_recording(tid);
end $$;

-- de app op productie reageert nog op de opdracht: dat is een reactie op de laatste opname
create or replace function public.react_to_task(p_task uuid, p_emoji text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not exists (select 1 from public.homework_tasks t join public.homework h on h.id = t.homework_id where t.id = p_task and h.given_by = auth.uid())
  then raise exception 'geen toegang'; end if;
  select r.id into rid from public.task_recordings r where r.task_id = p_task order by r.submitted_at desc limit 1;
  if rid is null then raise exception 'nog geen opname'; end if;
  perform public.react_to_recording(rid, p_emoji, p_text);
end $$;

-- ── Bewaartermijn: alle opnames van een verlopen opdracht ────────────
-- zelfde vorm als in 0011, zodat de Edge Function purge-recordings ongewijzigd blijft werken
create or replace function public.expired_recordings()
returns table (task_id uuid, path text) language sql stable security definer set search_path = public as $$
  select r.task_id, r.path from public.task_recordings r
    join public.homework_tasks t on t.id = r.task_id join public.homework h on h.id = t.homework_id
  where r.path is not null and h.due_date + 28 < current_date
  union
  select t.id, t.recording_path from public.homework_tasks t join public.homework h on h.id = t.homework_id
  where t.recording_path is not null and h.due_date + 28 < current_date
    and not exists (select 1 from public.task_recordings r where r.path = t.recording_path);
$$;
create or replace function public.mark_recordings_deleted(p_tasks uuid[])
returns void language sql security definer set search_path = public as $$
  update public.task_recordings set path = null, deleted_at = now() where task_id = any (p_tasks) and path is not null;
  update public.homework_tasks set recording_path = null, recording_deleted_at = now() where id = any (p_tasks);
$$;

revoke execute on function public.delete_recording(uuid) from public, anon;
revoke execute on function public.react_to_recording(uuid, text, text) from public, anon;
grant execute on function public.delete_recording(uuid) to authenticated;
grant execute on function public.react_to_recording(uuid, text, text) to authenticated;
