-- Opnames en bladmuziek (AC-118 stap 1b, mock-up docs/mockups/Huiswerk-Opdrachten.html stap 1b–6).
-- - Bucket "bladmuziek": de leraar (of ouder) uploadt bladmuziek (pdf of foto) en een voorbeeldopname
--   in zijn eigen map (<uid>/...). Wie het huiswerk met dat bestand mag zien, mag het openen.
-- - Bucket "opnames": de leerling neemt een stuk op en stuurt het in, in de map van de leerling
--   (<student_id>/<task_id>/...). Zien: de leerling, de ouder en de leraren (can_access_student).
-- - Toestemming: een kind onder 18 met een ouder neemt pas op als de ouder dat toestaat.
-- - Reageren: alleen wie het huiswerk gaf.
-- - Bewaren: 4 weken na de einddatum van het huiswerk; de Edge Function purge-recordings ruimt elke
--   nacht op (bestand weg, regel blijft met recording_deleted_at; de reactie blijft staan).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('bladmuziek', 'bladmuziek', false, 10485760,
   array['application/pdf','image/jpeg','image/png','image/heic','image/webp','audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/webm','audio/ogg','audio/wav']),
  ('opnames', 'opnames', false, 20971520, array['audio/webm','audio/mp4','audio/aac','audio/ogg','audio/mpeg','audio/wav'])
on conflict (id) do nothing;

alter table public.students add column recording_consent boolean not null default false;
comment on column public.students.recording_consent is 'de ouder staat toe dat het kind opnames instuurt (AC-118)';

alter table public.task_bank
  add column sheet_path text, add column sheet_name text not null default '', add column example_path text,
  add column recording boolean not null default false;
alter table public.homework_tasks
  add column sheet_path text, add column sheet_name text not null default '', add column example_path text,
  add column recording boolean not null default false,
  add column recording_path text, add column submitted_at timestamptz, add column recording_deleted_at timestamptz,
  add column reaction_emoji text not null default '', add column reaction text not null default '', add column reacted_at timestamptz;

create or replace function public.uuid_or_null(t text) returns uuid language plpgsql immutable as $$
begin return t::uuid; exception when others then return null; end $$;

-- mag dit kind opnames insturen? 18+, een eigen profiel zonder ouder, of toestemming van de ouder
create or replace function public.may_record(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = sid
    and (s.age_band = '18+' or s.owner_id = s.user_id or s.recording_consent));
$$;

-- ── Storage-regels ───────────────────────────────────────────────────
create policy "bladmuziek eigen map" on storage.objects for insert to authenticated
  with check (bucket_id = 'bladmuziek' and (storage.foldername(name))[1] = auth.uid()::text and public.my_role() in ('ouder','leraar'));
create policy "bladmuziek eigen map verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'bladmuziek' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bladmuziek lezen" on storage.objects for select to authenticated
  using (bucket_id = 'bladmuziek' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.homework_tasks t join public.homework h on h.id = t.homework_id
               where (t.sheet_path = name or t.example_path = name) and public.can_access_student(h.student_id))
  ));

create policy "opname insturen" on storage.objects for insert to authenticated
  with check (bucket_id = 'opnames' and public.can_access_student(public.uuid_or_null((storage.foldername(name))[1]))
              and public.may_record(public.uuid_or_null((storage.foldername(name))[1])));
create policy "opname verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'opnames' and public.can_access_student(public.uuid_or_null((storage.foldername(name))[1])));
create policy "opname beluisteren" on storage.objects for select to authenticated
  using (bucket_id = 'opnames' and (public.can_access_student(public.uuid_or_null((storage.foldername(name))[1])) or public.is_admin()));

-- ── Opdrachten met bladmuziek, voorbeeld en gevraagde opname ─────────
create or replace function public.add_homework_tasks(p_homework uuid, p_tasks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t jsonb; b public.books; pos integer; mine text := auth.uid()::text || '/';
begin
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 30 then raise exception 'ongeldige opdracht'; end if;
  select coalesce(max(position) + 1, 0) into pos from public.homework_tasks where homework_id = p_homework;
  for t in select * from jsonb_array_elements(p_tasks) loop
    if coalesce(t->>'kind', '') not in ('stuk','opdracht') or length(trim(coalesce(t->>'title', ''))) = 0
       or (nullif(t->>'sheet_path', '') is not null and not starts_with(t->>'sheet_path', mine))
       or (nullif(t->>'example_path', '') is not null and not starts_with(t->>'example_path', mine))
    then raise exception 'ongeldige opdracht'; end if;
    b := null;
    if t->>'book_id' is not null then select * into b from public.books where id = (t->>'book_id')::uuid and owner_id = auth.uid(); end if;
    insert into public.homework_tasks (homework_id, position, kind, title, book_title, book_author, page, chapter, number, track, bank_id,
                                       sheet_path, sheet_name, example_path, recording)
    values (p_homework, pos, t->>'kind', left(trim(t->>'title'), 300), coalesce(b.title, ''), coalesce(b.author, ''),
            left(coalesce(t->>'page', ''), 20), left(coalesce(t->>'chapter', ''), 40), left(coalesce(t->>'number', ''), 20), left(coalesce(t->>'track', ''), 20),
            (select id from public.task_bank where id = nullif(t->>'bank_id', '')::uuid and owner_id = auth.uid()),
            nullif(t->>'sheet_path', ''), left(coalesce(t->>'sheet_name', ''), 200), nullif(t->>'example_path', ''),
            t->>'kind' = 'stuk' and coalesce((t->>'recording')::boolean, false));
    pos := pos + 1;
  end loop;
end $$;
revoke execute on function public.add_homework_tasks(uuid, jsonb) from public, anon, authenticated;

create or replace function public.assign_tasks(p_students uuid[], p_bank_ids uuid[], p_due date)
returns integer language plpgsql security definer set search_path = public as $$
declare sid uuid; hid uuid; tasks jsonb; n integer := 0;
begin
  if p_students is null or cardinality(p_students) = 0 or p_bank_ids is null or cardinality(p_bank_ids) = 0 then raise exception 'ongeldig huiswerk'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'book_id', book_id, 'page', page, 'chapter', chapter,
                                               'number', number, 'track', track, 'bank_id', id, 'sheet_path', sheet_path, 'sheet_name', sheet_name,
                                               'example_path', example_path, 'recording', recording) order by array_position(p_bank_ids, id)), '[]')
    into tasks from public.task_bank where id = any (p_bank_ids) and owner_id = auth.uid();
  if jsonb_array_length(tasks) = 0 then raise exception 'geen toegang'; end if;
  foreach sid in array p_students loop
    select id into hid from public.homework
      where student_id = sid and given_by = auth.uid() and due_date >= current_date order by created_at desc limit 1;
    if hid is null then
      hid := (public.give_homework(sid, '[]', 15, 5, '', '', '', coalesce(p_due, current_date + 7))).id;
    elsif not (public.can_access_student(sid)) then
      raise exception 'geen toegang';
    end if;
    perform public.add_homework_tasks(hid, tasks);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Toestemming, insturen, reageren ──────────────────────────────────
create or replace function public.set_recording_consent(p_student uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.students where id = p_student and owner_id = auth.uid() and public.my_role() in ('ouder','leraar'))
  then raise exception 'geen toegang'; end if;
  update public.students set recording_consent = coalesce(p_allowed, false) where id = p_student;
end $$;

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
  update public.homework_tasks set recording_path = p_path, submitted_at = now(), recording_deleted_at = null,
    reaction_emoji = '', reaction = '', reacted_at = null where id = p_task;
end $$;

create or replace function public.react_to_task(p_task uuid, p_emoji text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.homework_tasks t join public.homework h on h.id = t.homework_id where t.id = p_task and h.given_by = auth.uid())
  then raise exception 'geen toegang'; end if;
  update public.homework_tasks set reaction_emoji = left(coalesce(p_emoji, ''), 16), reaction = left(coalesce(p_text, ''), 1000), reacted_at = now()
    where id = p_task;
end $$;

-- opnames die over hun bewaartermijn zijn (4 weken na de einddatum); voor de opruimtaak (service)
create or replace function public.expired_recordings()
returns table (task_id uuid, path text) language sql stable security definer set search_path = public as $$
  select t.id, t.recording_path from public.homework_tasks t join public.homework h on h.id = t.homework_id
  where t.recording_path is not null and h.due_date + 28 < current_date;
$$;
create or replace function public.mark_recordings_deleted(p_tasks uuid[])
returns void language sql security definer set search_path = public as $$
  update public.homework_tasks set recording_path = null, recording_deleted_at = now() where id = any (p_tasks);
$$;

revoke execute on function public.set_recording_consent(uuid, boolean) from public, anon;
revoke execute on function public.submit_recording(uuid, text) from public, anon;
revoke execute on function public.react_to_task(uuid, text, text) from public, anon;
revoke execute on function public.expired_recordings() from public, anon, authenticated;
revoke execute on function public.mark_recordings_deleted(uuid[]) from public, anon, authenticated;
grant execute on function public.set_recording_consent(uuid, boolean) to authenticated;
grant execute on function public.submit_recording(uuid, text) to authenticated;
grant execute on function public.react_to_task(uuid, text, text) to authenticated;
grant execute on function public.expired_recordings() to service_role;
grant execute on function public.mark_recordings_deleted(uuid[]) to service_role;
