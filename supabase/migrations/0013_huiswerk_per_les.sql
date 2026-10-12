-- Huiswerk per les (feedback en besluiten Alwin, 12-10-2026).
-- Tot nu toe maakte opslaan altijd nieuw huiswerk en de app toonde per gever alleen het nieuwste;
-- aanpassen leek daardoor alles te resetten (afvinken, opnames, gehaalde dagen).
--
-- - Een les heeft een start- en einddatum: homework.start_date (nieuw) t/m homework.due_date.
--   Per leerling een vaste lesdag (students.lesson_weekday): een les loopt van lesdag tot de dag vóór
--   de volgende lesdag. Zonder lesdag: deze les = vandaag + 6 dagen, volgende les = de week erna.
-- - Huiswerk geven kies je voor "deze" of "volgende" les. Heb je voor die les al huiswerk gegeven, dan
--   komen de opdrachten erbij (give_for_lesson); het lopende huiswerk verandert verder niet.
-- - update_homework past één huiswerk aan zonder het opnieuw te beginnen: een opdracht die blijft houdt
--   zijn vinkje en opnames; een weggehaalde opdracht met opnames blijft staan.
-- - end_homework stopt een huiswerk (einddatum gisteren).
-- - Huiswerk van een les die nog niet begonnen is, ziet alleen wie het gaf. Zo ziet een leerling
--   (ook in de app op productie, die het nieuwste huiswerk toont) het pas vanaf de startdatum.

alter table public.homework add column start_date date;
update public.homework set start_date = least(created_at::date, due_date);
alter table public.homework alter column start_date set not null, alter column start_date set default current_date;
-- geen check start <= eind in de tabel: de functies controleren dat; stoppen en de bewaartermijn verschuiven alleen de einddatum

alter table public.students add column lesson_weekday smallint check (lesson_weekday between 0 and 6);
comment on column public.students.lesson_weekday is 'vaste lesdag (0 = zondag … 6 = zaterdag); null = geen vaste lesdag';

drop policy "huiswerk lezen" on public.homework;
create policy "huiswerk lezen" on public.homework for select using (
  (public.can_access_student(student_id) or public.is_admin()) and (start_date <= current_date or given_by = auth.uid())
);
drop policy "opdrachten lezen" on public.homework_tasks;
create policy "opdrachten lezen" on public.homework_tasks for select using (
  exists (select 1 from public.homework h where h.id = homework_id and (public.can_access_student(h.student_id) or public.is_admin())
          and (h.start_date <= current_date or h.given_by = auth.uid()))
);

-- ── De les: start en eind ────────────────────────────────────────────
create or replace function public.lesson_period(p_student uuid, p_which text, out start_date date, out due_date date)
language plpgsql stable security definer set search_path = public as $$
declare wd smallint; last date;
begin
  if p_which not in ('deze','volgende') then raise exception 'ongeldige les'; end if;
  select lesson_weekday into wd from public.students where id = p_student;
  if wd is null then
    start_date := current_date + case when p_which = 'deze' then 0 else 7 end;
  else
    -- de laatste lesdag (vandaag als het vandaag lesdag is)
    last := current_date - ((extract(dow from current_date)::int - wd + 7) % 7);
    start_date := last + case when p_which = 'deze' then 0 else 7 end;
  end if;
  due_date := start_date + 6;
end $$;

-- ── Opdrachten toevoegen aan of beginnen met het huiswerk van een les ─
create or replace function public.give_for_lesson(
  p_students uuid[], p_which text, p_notes jsonb, p_minutes integer, p_days integer, p_remark text, p_tasks jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare sid uuid; per record; hid uuid; n integer := 0;
begin
  if p_students is null or cardinality(p_students) = 0 or cardinality(p_students) > 200 then raise exception 'ongeldig huiswerk'; end if;
  foreach sid in array p_students loop
    per := public.lesson_period(sid, p_which);
    -- deze les: mijn huiswerk dat nu loopt; volgende les: mijn huiswerk dat nog moet beginnen
    select id into hid from public.homework
      where student_id = sid and given_by = auth.uid() and due_date >= current_date
        and (case when p_which = 'deze' then start_date <= current_date else start_date > current_date end)
      order by start_date desc, created_at desc limit 1;
    if hid is null then
      hid := (public.give_homework(sid, p_notes, p_minutes, p_days, '', '', p_remark, per.due_date)).id;
      update public.homework set start_date = per.start_date where id = hid;
    else
      if not public.can_access_student(sid) then raise exception 'geen toegang'; end if;
      -- erbij: noten aanvullen, de rest van het lopende huiswerk blijft zoals het is
      update public.homework set notes = (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements(notes || coalesce(p_notes, '[]')) x)
        where id = hid;
      insert into public.student_notes (student_id, note_id, status)
        select sid, x, 'les' from jsonb_array_elements_text(coalesce(p_notes, '[]')) x
      on conflict (student_id, note_id) do nothing;
    end if;
    perform public.add_homework_tasks(hid, coalesce(p_tasks, '[]'));
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Eén huiswerk aanpassen zonder opnieuw te beginnen ────────────────
create or replace function public.update_homework(
  p_homework uuid, p_notes jsonb, p_minutes integer, p_days integer, p_remark text, p_start date, p_due date, p_tasks jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare h public.homework; t jsonb; b public.books; pos integer := 0; keep uuid[] := '{}'; tid uuid; mine text := auth.uid()::text || '/';
begin
  select * into h from public.homework where id = p_homework;
  if h.id is null or auth.uid() is null or h.given_by <> auth.uid() then raise exception 'geen toegang'; end if;
  if p_minutes is null or p_minutes not between 1 and 180 or p_days is null or p_days not between 1 and 7
     or p_due is null or p_due < current_date or p_start is null or p_start > p_due
     or jsonb_typeof(p_notes) <> 'array' or jsonb_array_length(p_notes) > 40
     or exists (select 1 from jsonb_array_elements(p_notes) n where jsonb_typeof(n) <> 'string')
     or p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 30
  then raise exception 'ongeldig huiswerk'; end if;

  update public.homework set notes = p_notes, minutes_per_day = p_minutes, days_per_week = p_days,
    remark = left(coalesce(p_remark, ''), 1000), start_date = p_start, due_date = p_due where id = p_homework;
  -- nieuwe noten komen op "in de les"; wat het kind al kent blijft staan
  insert into public.student_notes (student_id, note_id, status)
    select h.student_id, n, 'les' from jsonb_array_elements_text(p_notes) n
  on conflict (student_id, note_id) do nothing;

  for t in select * from jsonb_array_elements(p_tasks) loop
    if coalesce(t->>'kind', '') not in ('stuk','opdracht') or length(trim(coalesce(t->>'title', ''))) = 0
       or (nullif(t->>'sheet_path', '') is not null and not starts_with(t->>'sheet_path', mine))
       or (nullif(t->>'example_path', '') is not null and not starts_with(t->>'example_path', mine))
    then raise exception 'ongeldige opdracht'; end if;
    b := null;
    if t->>'book_id' is not null then select * into b from public.books where id = (t->>'book_id')::uuid and owner_id = auth.uid(); end if;
    tid := (select id from public.homework_tasks where id = public.uuid_or_null(t->>'id') and homework_id = p_homework);
    if tid is not null then
      -- bestaande opdracht: vinkje, opnames en reacties blijven
      update public.homework_tasks set position = pos, kind = t->>'kind', title = left(trim(t->>'title'), 300),
        book_title = case when t->>'book_id' is not null then coalesce(b.title, '') else book_title end,
        book_author = case when t->>'book_id' is not null then coalesce(b.author, '') else book_author end,
        page = left(coalesce(t->>'page', ''), 20), chapter = left(coalesce(t->>'chapter', ''), 40),
        number = left(coalesce(t->>'number', ''), 20), track = left(coalesce(t->>'track', ''), 20),
        sheet_path = nullif(t->>'sheet_path', ''), sheet_name = left(coalesce(t->>'sheet_name', ''), 200),
        example_path = nullif(t->>'example_path', ''),
        recording = t->>'kind' = 'stuk' and coalesce((t->>'recording')::boolean, false)
      where id = tid;
    else
      insert into public.homework_tasks (homework_id, position, kind, title, book_title, book_author, page, chapter, number, track, bank_id,
                                         sheet_path, sheet_name, example_path, recording)
      values (p_homework, pos, t->>'kind', left(trim(t->>'title'), 300), coalesce(b.title, ''), coalesce(b.author, ''),
              left(coalesce(t->>'page', ''), 20), left(coalesce(t->>'chapter', ''), 40), left(coalesce(t->>'number', ''), 20), left(coalesce(t->>'track', ''), 20),
              (select id from public.task_bank where id = nullif(t->>'bank_id', '')::uuid and owner_id = auth.uid()),
              nullif(t->>'sheet_path', ''), left(coalesce(t->>'sheet_name', ''), 200), nullif(t->>'example_path', ''),
              t->>'kind' = 'stuk' and coalesce((t->>'recording')::boolean, false))
      returning id into tid;
    end if;
    keep := keep || tid;
    pos := pos + 1;
  end loop;

  -- weggehaalde opdrachten weg, behalve als er opnames bij zijn (die blijven, achteraan)
  delete from public.homework_tasks tt where tt.homework_id = p_homework and not (tt.id = any (keep))
    and not exists (select 1 from public.task_recordings r where r.task_id = tt.id);
end $$;

create or replace function public.end_homework(p_homework uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.homework where id = p_homework and given_by = auth.uid()) then raise exception 'geen toegang'; end if;
  update public.homework set due_date = least(due_date, current_date - 1), start_date = least(start_date, current_date - 1) where id = p_homework;
end $$;

revoke execute on function public.lesson_period(uuid, text) from public, anon;
revoke execute on function public.give_for_lesson(uuid[], text, jsonb, integer, integer, text, jsonb) from public, anon;
revoke execute on function public.update_homework(uuid, jsonb, integer, integer, text, date, date, jsonb) from public, anon;
revoke execute on function public.end_homework(uuid) from public, anon;
grant execute on function public.lesson_period(uuid, text) to authenticated;
grant execute on function public.give_for_lesson(uuid[], text, jsonb, integer, integer, text, jsonb) to authenticated;
grant execute on function public.update_homework(uuid, jsonb, integer, integer, text, date, date, jsonb) to authenticated;
grant execute on function public.end_homework(uuid) to authenticated;
