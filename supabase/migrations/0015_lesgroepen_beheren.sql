-- Lesgroepen beheren (AC-124 stap 2, docs/superpowers/specs/2026-10-13-lesgroepen-beheren-design.md).
-- Groepen opheffen, lessen afzeggen en verzetten, vakanties per leraar, een lid in een periode.
-- "Huiswerk stoppen" wordt status gestopt; afgezegd is voortaan een les die niet doorgaat.

alter table public.lesson_groups add column ended_on date;
alter table public.lessons add column reason text not null default '';
alter table public.lessons add column original_date date;
alter table public.lessons drop constraint lessons_status_check;
alter table public.lessons add constraint lessons_status_check check (status in ('gepland','gegeven','afgezegd','gestopt'));
-- afzeggen bestond nog niet: elke afgezegde les was gestopt huiswerk
update public.lessons set status = 'gestopt' where status = 'afgezegd';

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',
  start_date date not null,
  end_date date not null,
  check (end_date >= start_date)
);
create index on public.holidays (teacher_id, start_date);
alter table public.holidays enable row level security;
create policy "vakanties lezen" on public.holidays for select using (teacher_id = auth.uid());

-- ── Periodes ─────────────────────────────────────────────────────────
create or replace function public.in_holiday(p_group uuid, p_day date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.holidays h join public.lesson_groups g on g.teacher_id = h.teacher_id
                 where g.id = p_group and p_day between h.start_date and h.end_date);
$$;

-- de eerstvolgende roosterdag na p_after die doorgaat: geen vakantie, niet afgezegd of gestopt, niet verzet
create or replace function public.next_lesson_day(p_group uuid, p_after date) returns date
language plpgsql stable security definer set search_path = public as $$
declare d date := p_after; i int;
begin
  for i in 1..60 loop
    d := public.scheduled_day(p_group, d, 1);
    if d is null then return null; end if;
    if not public.in_holiday(p_group, d)
       and not exists (select 1 from public.lessons l where l.group_id = p_group
                       and ((l.date = d and l.status in ('afgezegd','gestopt')) or (l.original_date = d and l.date <> d)))
    then return d; end if;
  end loop;
  return null;
end $$;

-- einde van de huiswerkperiode: de dag vóór de eerstvolgende les die niet afgezegd is, of de volgende lesdag; anders een week
create or replace function public.lesson_end(p_lesson uuid) returns date
language sql stable security definer set search_path = public as $$
  select coalesce(least(
           (select min(n.date) from public.lessons n where n.group_id = l.group_id and n.date > l.date and n.status <> 'afgezegd'),
           public.next_lesson_day(l.group_id, l.date)) - 1,
         l.date + 6)
  from public.lessons l where l.id = p_lesson;
$$;
-- als kolom voor PostgREST: lessons?select=*,end_date
create or replace function public.end_date(public.lessons) returns date
language sql stable security definer set search_path = public as $$ select public.lesson_end($1.id) $$;

-- ── Lidmaatschap in een periode ──────────────────────────────────────
-- een lid hoort bij een les als zijn lidmaatschap de huiswerkperiode raakt
create or replace function public.member_during(p_group uuid, p_student uuid, p_lesson uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members m join public.lessons l on l.id = p_lesson and l.group_id = m.group_id
                 where m.group_id = p_group and m.student_id = p_student
                   -- eerst de goedkope vergelijking; lesson_end alleen voor wie na de lesdatum instapte
                   and (m.joined_on <= l.date or m.joined_on <= public.lesson_end(l.id)) and (m.left_on is null or m.left_on >= l.date));
$$;

create or replace function public.lesson_visible(p_lesson uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lessons l where l.id = p_lesson and (
    public.is_group_teacher(l.group_id) or public.is_admin()
    or (l.date <= current_date and exists (select 1 from public.group_members m where m.group_id = l.group_id
          and public.can_access_student(m.student_id) and public.member_during(l.group_id, m.student_id, l.id)))));
$$;

create or replace function public.member_of_lesson(p_homework uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.homework h join public.lessons l on l.id = h.lesson_id
                 where h.id = p_homework and public.member_during(l.group_id, p_student, l.id));
$$;

-- ── Privégroep: alleen een groep zonder naam, met één lid ────────────
create or replace function public.ensure_group(p_student uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; s public.students; gid uuid;
begin
  select * into me from public.profiles where id = auth.uid();
  select * into s from public.students where id = p_student;
  if me.id is null or s.id is null or me.role not in ('ouder','leraar')
     or not (s.owner_id = me.id or exists (select 1 from public.teacher_students where teacher_id = me.id and student_id = s.id))
  then raise exception 'geen toegang'; end if;
  select g.id into gid from public.lesson_groups g join public.group_members m on m.group_id = g.id
  where g.teacher_id = me.id and g.name = '' and g.ended_on is null and m.student_id = p_student and m.left_on is null
    and (select count(*) from public.group_members x where x.group_id = g.id and x.left_on is null) = 1
  order by g.created_at limit 1;
  if gid is null then
    insert into public.lesson_groups (teacher_id, teacher_name, kind) values (me.id, me.display_name, case when me.role = 'leraar' then 'les' else 'thuis' end)
    returning id into gid;
    insert into public.group_members (group_id, student_id) values (gid, p_student);
  end if;
  return gid;
end $$;

-- ── Stoppen ──────────────────────────────────────────────────────────
create or replace function public.end_lesson(p_lesson uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.lessons where id = p_lesson and public.is_group_teacher(group_id)) then raise exception 'geen toegang'; end if;
  update public.lessons set status = 'gestopt' where id = p_lesson;
end $$;

-- ── Hulpfuncties niet voor anon ──────────────────────────────────────
revoke execute on function public.in_holiday(uuid, date), public.next_lesson_day(uuid, date), public.lesson_end(uuid),
  public.member_during(uuid, uuid, uuid), public.scheduled_day(uuid, date, int), public.is_group_teacher(uuid),
  public.can_see_group(uuid), public.lesson_visible(uuid), public.member_of_lesson(uuid, uuid) from public, anon;
grant execute on function public.in_holiday(uuid, date), public.next_lesson_day(uuid, date), public.lesson_end(uuid),
  public.member_during(uuid, uuid, uuid), public.scheduled_day(uuid, date, int), public.is_group_teacher(uuid),
  public.can_see_group(uuid), public.lesson_visible(uuid), public.member_of_lesson(uuid, uuid), public.end_date(public.lessons) to authenticated;

-- ── Groepen beheren (alleen een leraar) ──────────────────────────────
create or replace function public.check_group_name(p_name text) returns text
language plpgsql immutable as $$
begin
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'ongeldige groep'; end if;
  return left(trim(p_name), 80);
end $$;

create or replace function public.create_group(p_name text, p_students uuid[], p_weekday smallint, p_start_time time) returns uuid
language plpgsql security definer set search_path = public as $$
declare me public.profiles; gid uuid; sid uuid; nm text := public.check_group_name(p_name);
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.role <> 'leraar' then raise exception 'geen toegang'; end if;
  if p_students is null or cardinality(p_students) = 0 or cardinality(p_students) > 40 then raise exception 'ongeldige groep'; end if;
  foreach sid in array p_students loop
    if not exists (select 1 from public.teacher_students where teacher_id = me.id and student_id = sid) then raise exception 'geen toegang'; end if;
  end loop;
  insert into public.lesson_groups (teacher_id, teacher_name, kind, name) values (me.id, me.display_name, 'les', nm) returning id into gid;
  insert into public.group_members (group_id, student_id) select gid, s from unnest(p_students) s on conflict do nothing;
  if p_weekday is not null then insert into public.schedule_rules (group_id, weekday, start_time) values (gid, p_weekday, p_start_time); end if;
  return gid;
end $$;

create or replace function public.rename_group(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare nm text := public.check_group_name(p_name);
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  update public.lesson_groups set name = nm where id = p_group;
end $$;

create or replace function public.add_member(p_group uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_teacher(p_group)
     or not exists (select 1 from public.teacher_students where teacher_id = auth.uid() and student_id = p_student)
  then raise exception 'geen toegang'; end if;
  -- een privéles (zonder naam) blijft van één leerling
  if exists (select 1 from public.lesson_groups where id = p_group and name = '') then raise exception 'ongeldige groep'; end if;
  insert into public.group_members (group_id, student_id) values (p_group, p_student)
  on conflict (group_id, student_id) do update set joined_on = current_date, left_on = null where public.group_members.left_on is not null;
end $$;

create or replace function public.remove_member(p_group uuid, p_student uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  update public.group_members set left_on = current_date where group_id = p_group and student_id = p_student and left_on is null;
end $$;

create or replace function public.end_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  update public.lesson_groups set ended_on = current_date where id = p_group and ended_on is null;
end $$;

drop function public.set_schedule(uuid, smallint);
-- p_start_time met default: productie (0.2.0) roept hem met twee parameters aan tot de release
create function public.set_schedule(p_group uuid, p_weekday smallint, p_start_time time default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  update public.schedule_rules set valid_until = current_date - 1 where group_id = p_group and valid_until is null and valid_from < current_date;
  delete from public.schedule_rules where group_id = p_group and valid_from >= current_date;
  if p_weekday is not null then insert into public.schedule_rules (group_id, weekday, start_time) values (p_group, p_weekday, p_start_time); end if;
end $$;

-- de begintijd van het rooster op een dag
create or replace function public.scheduled_time(p_group uuid, p_day date) returns time
language sql stable security definer set search_path = public as $$
  select start_time from public.schedule_rules where group_id = p_group and valid_from <= p_day
    and (valid_until is null or valid_until >= p_day) order by valid_from desc limit 1;
$$;
revoke execute on function public.scheduled_time(uuid, date), public.check_group_name(text) from public, anon;

create or replace function public.lesson_for(p_group uuid, p_which text) returns public.lessons
language plpgsql security definer set search_path = public as $$
declare l public.lessons; d date;
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  if exists (select 1 from public.lesson_groups where id = p_group and ended_on is not null) then raise exception 'ongeldige groep'; end if;
  if p_which = 'deze' then
    select * into l from public.lessons where group_id = p_group and date <= current_date and status in ('gepland','gegeven')
      and public.lesson_end(id) >= current_date order by date desc limit 1;
    d := coalesce(public.scheduled_day(p_group, current_date, -1), current_date);
  elsif p_which = 'volgende' then
    select * into l from public.lessons where group_id = p_group and date > current_date and status in ('gepland','gegeven') order by date limit 1;
    d := coalesce(public.next_lesson_day(p_group, current_date), current_date + 7);
  else raise exception 'ongeldige les'; end if;
  -- is de les op die dag gestopt of afgezegd, dan begint "deze les" vandaag opnieuw in plaats van die terug te halen
  if l.id is null and p_which = 'deze' and exists (select 1 from public.lessons where group_id = p_group and date = d and status in ('afgezegd','gestopt')) then
    d := current_date;
  end if;
  if l.id is null then
    -- staat er op die dag een gestopte of afgezegde les, dan begint die opnieuw: leeg, zonder het oude huiswerk
    delete from public.homework h using public.lessons x
      where h.lesson_id = x.id and x.group_id = p_group and x.date = d and x.status in ('afgezegd','gestopt');
    update public.lessons set notes = '[]', remark = '', reason = '' where group_id = p_group and date = d and status in ('afgezegd','gestopt');
    insert into public.lessons (group_id, date, start_time, status)
    values (p_group, d, public.scheduled_time(p_group, d), case when d <= current_date then 'gegeven' else 'gepland' end)
    on conflict (group_id, date) do update set status = case when excluded.date <= current_date then 'gegeven' else 'gepland' end
    returning * into l;
  end if;
  return l;
end $$;
revoke execute on function public.create_group(text, uuid[], smallint, time), public.rename_group(uuid, text), public.add_member(uuid, uuid),
  public.remove_member(uuid, uuid), public.end_group(uuid), public.set_schedule(uuid, smallint, time) from public, anon;
grant execute on function public.create_group(text, uuid[], smallint, time), public.rename_group(uuid, text), public.add_member(uuid, uuid),
  public.remove_member(uuid, uuid), public.end_group(uuid), public.set_schedule(uuid, smallint, time) to authenticated;

-- ── Afzeggen en verzetten ────────────────────────────────────────────
create or replace function public.cancel_lesson(p_group uuid, p_date date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare l public.lessons; nxt public.lessons; d date;
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  if p_date is null or p_date < current_date then raise exception 'ongeldige les'; end if;
  insert into public.lessons (group_id, date, start_time, status, reason)
  values (p_group, p_date, public.scheduled_time(p_group, p_date), 'afgezegd', left(coalesce(p_reason, ''), 200))
  on conflict (group_id, date) do update set status = 'afgezegd', reason = excluded.reason
  returning * into l;
  if not exists (select 1 from public.homework where lesson_id = l.id) then return; end if;
  -- klaargezet huiswerk schuift naar de eerstvolgende les die doorgaat
  select * into nxt from public.lessons where group_id = p_group and date > p_date and status in ('gepland','gegeven') order by date limit 1;
  d := public.next_lesson_day(p_group, p_date);
  if nxt.id is null or (d is not null and d < nxt.date) then
    insert into public.lessons (group_id, date, start_time, status, notes, minutes_per_day, days_per_week, remark)
    values (p_group, coalesce(d, p_date + 7), public.scheduled_time(p_group, coalesce(d, p_date + 7)), 'gepland', l.notes, l.minutes_per_day, l.days_per_week, l.remark)
    on conflict (group_id, date) do update set status = 'gepland'
    returning * into nxt;
  elsif not exists (select 1 from public.homework where lesson_id = nxt.id) and nxt.notes = '[]'::jsonb and nxt.remark = '' then
    update public.lessons set notes = l.notes, minutes_per_day = l.minutes_per_day, days_per_week = l.days_per_week, remark = l.remark where id = nxt.id;
  else
    -- die les heeft al iets: zijn doel blijft, de noten komen erbij
    update public.lessons set notes = (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements(notes || l.notes) x) where id = nxt.id;
  end if;
  insert into public.homework (lesson_id, assignment_id, position, description)
    select nxt.id, h.assignment_id, (select coalesce(max(position) + 1, 0) from public.homework where lesson_id = nxt.id) + h.position, h.description
    from public.homework h where h.lesson_id = l.id
  on conflict (lesson_id, assignment_id) do nothing;
  delete from public.homework where lesson_id = l.id;
end $$;

create or replace function public.move_lesson(p_group uuid, p_date date, p_new_date date, p_start_time time) returns void
language plpgsql security definer set search_path = public as $$
declare l public.lessons;
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  if p_new_date is null or p_new_date < current_date or p_new_date = p_date
     or exists (select 1 from public.lessons where group_id = p_group and date = p_new_date) then raise exception 'ongeldige les'; end if;
  select * into l from public.lessons where group_id = p_group and date = p_date;
  if l.id is null then
    insert into public.lessons (group_id, date, start_time, status, original_date) values (p_group, p_new_date, p_start_time, 'gepland', p_date);
  else
    update public.lessons set date = p_new_date, start_time = p_start_time, original_date = coalesce(original_date, p_date),
      status = case when status = 'afgezegd' then 'gepland' else status end where id = l.id;
  end if;
end $$;

-- ── Vakanties ────────────────────────────────────────────────────────
create or replace function public.add_holiday(p_name text, p_from date, p_to date) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'leraar') then raise exception 'geen toegang'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 120 then raise exception 'ongeldige vakantie'; end if;
  insert into public.holidays (teacher_id, name, start_date, end_date) values (auth.uid(), left(trim(coalesce(p_name, '')), 80), p_from, p_to) returning id into hid;
  return hid;
end $$;

create or replace function public.remove_holiday(p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.holidays where id = p_id and teacher_id = auth.uid();
$$;

-- ── Controles (stap 1, klein punt 4) ─────────────────────────────────
create or replace function public.check_notes(p_notes jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if p_notes is null then return '[]'; end if;
  if jsonb_typeof(p_notes) <> 'array' or jsonb_array_length(p_notes) > 40
     or exists (select 1 from jsonb_array_elements(p_notes) x where jsonb_typeof(x) <> 'string' or length(x #>> '{}') > 8)
  then raise exception 'ongeldig huiswerk'; end if;
  return p_notes;
end $$;
revoke execute on function public.check_notes(jsonb) from public, anon;

create or replace function public.give_homework(p_group uuid, p_which text, p_notes jsonb, p_minutes integer, p_days integer, p_remark text,
                                     p_tasks jsonb, p_carry uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.lessons; had boolean;
begin
  perform public.check_notes(p_notes);
  if p_minutes is null or p_minutes not between 1 and 180 or p_days is null or p_days not between 1 and 7
     or jsonb_typeof(coalesce(p_notes, '[]')) <> 'array' then raise exception 'ongeldig huiswerk'; end if;
  l := public.lesson_for(p_group, p_which);
  had := exists (select 1 from public.homework where lesson_id = l.id);
  if had then
    -- erbij: noten aanvullen, de rest van de les blijft zoals hij is
    update public.lessons set notes = (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements(notes || coalesce(p_notes, '[]')) x) where id = l.id;
  else
    update public.lessons set notes = coalesce(p_notes, '[]'), minutes_per_day = p_minutes, days_per_week = p_days, remark = left(coalesce(p_remark, ''), 1000) where id = l.id;
  end if;
  perform public.notes_to_members(p_group, p_notes);
  insert into public.homework (lesson_id, assignment_id, position)
    select l.id, a.id, (select coalesce(max(position) + 1, 0) from public.homework where lesson_id = l.id) + row_number() over () - 1
    from unnest(coalesce(p_carry, '{}')) c join public.assignments a on a.id = c and a.group_id = p_group
  on conflict (lesson_id, assignment_id) do nothing;
  perform public.add_assignments(l.id, coalesce(p_tasks, '[]'));
  return l.id;
end $$;

create or replace function public.update_lesson(p_lesson uuid, p_notes jsonb, p_minutes integer, p_days integer, p_remark text, p_date date, p_tasks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare l public.lessons; t jsonb; b public.books; pos integer := 0; keep uuid[] := '{}'; aid uuid; mine text := auth.uid()::text || '/';
begin
  select * into l from public.lessons where id = p_lesson;
  if l.id is null or not public.is_group_teacher(l.group_id) then raise exception 'geen toegang'; end if;
  if p_minutes is null or p_minutes not between 1 and 180 or p_days is null or p_days not between 1 and 7 or p_date is null
     or jsonb_typeof(p_notes) <> 'array' or p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 30
  then raise exception 'ongeldig huiswerk'; end if;
  perform public.check_notes(p_notes);
  if exists (select 1 from public.lessons where group_id = l.group_id and date = p_date and id <> p_lesson) then raise exception 'ongeldig huiswerk'; end if;
  update public.lessons set notes = p_notes, minutes_per_day = p_minutes, days_per_week = p_days, remark = left(coalesce(p_remark, ''), 1000), date = p_date
  where id = p_lesson;
  perform public.notes_to_members(l.group_id, p_notes);
  for t in select * from jsonb_array_elements(p_tasks) loop
    aid := (select a.id from public.assignments a join public.homework h on h.assignment_id = a.id
            where a.id = public.uuid_or_null(t->>'id') and h.lesson_id = p_lesson);
    if aid is null then
      perform public.add_assignments(p_lesson, jsonb_build_array(t));
      select assignment_id into aid from public.homework where lesson_id = p_lesson order by position desc limit 1;
    else
      if coalesce(t->>'kind', '') not in ('stuk','opdracht') or length(trim(coalesce(t->>'title', ''))) = 0
         or (nullif(t->>'sheet_path', '') is not null and not starts_with(t->>'sheet_path', mine))
         or (nullif(t->>'example_path', '') is not null and not starts_with(t->>'example_path', mine))
      then raise exception 'ongeldige opdracht'; end if;
      b := null;
      if t->>'book_id' is not null then select * into b from public.books where id = (t->>'book_id')::uuid and owner_id = auth.uid(); end if;
      update public.assignments set kind = t->>'kind', title = left(trim(t->>'title'), 300),
        book_title = case when t->>'book_id' is not null then coalesce(b.title, '') else book_title end,
        book_author = case when t->>'book_id' is not null then coalesce(b.author, '') else book_author end,
        page = left(coalesce(t->>'page', ''), 20), chapter = left(coalesce(t->>'chapter', ''), 40),
        number = left(coalesce(t->>'number', ''), 20), track = left(coalesce(t->>'track', ''), 20),
        sheet_path = nullif(t->>'sheet_path', ''), sheet_name = left(coalesce(t->>'sheet_name', ''), 200),
        example_path = nullif(t->>'example_path', ''), recording = t->>'kind' = 'stuk' and coalesce((t->>'recording')::boolean, false)
      where id = aid;
    end if;
    update public.homework set position = pos where lesson_id = p_lesson and assignment_id = aid;
    keep := keep || aid; pos := pos + 1;
  end loop;
  -- weggehaald: alleen de huiswerkregel van deze les; de opdracht gaat pas weg als hij nergens meer staat en geen opnames heeft
  delete from public.homework where lesson_id = p_lesson and not (assignment_id = any (keep));
  delete from public.assignments a where a.group_id = l.group_id
    and not exists (select 1 from public.homework h where h.assignment_id = a.id)
    and not exists (select 1 from public.recordings r where r.assignment_id = a.id);
end $$;

create or replace function public.set_progress(p_assignment uuid, p_student uuid, p_status text, p_grade numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.assignments a join public.group_members m on m.group_id = a.group_id and m.student_id = p_student
                 where a.id = p_assignment and public.is_group_teacher(a.group_id)) then raise exception 'geen toegang'; end if;
  if p_status not in ('bezig','klaar') or (p_grade is not null and p_grade not between 1 and 10) then raise exception 'ongeldige voortgang'; end if;
  insert into public.progress (assignment_id, student_id, status, grade) values (p_assignment, p_student, p_status, p_grade)
  on conflict (assignment_id, student_id) do update set status = excluded.status, grade = excluded.grade, updated_at = now();
end $$;

-- een opname alleen bij een huidig lid
create or replace function public.submit_recording(p_assignment uuid, p_student uuid, p_path text, p_seconds integer default 0) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assignments; s public.students; sec integer := least(greatest(coalesce(p_seconds, 0), 0), 300);
begin
  select * into a from public.assignments where id = p_assignment;
  select * into s from public.students where id = p_student;
  if a.id is null or s.id is null or auth.uid() is null or auth.uid() not in (s.user_id, s.owner_id)
     or not exists (select 1 from public.group_members m where m.group_id = a.group_id and m.student_id = s.id and m.left_on is null)
  then raise exception 'geen toegang'; end if;
  if not a.recording then raise exception 'geen opname gevraagd'; end if;
  if not public.may_record(s.id) then raise exception 'geen toestemming'; end if;
  if p_path is null or not starts_with(p_path, s.id::text || '/' || a.id::text || '/') then raise exception 'ongeldige opname'; end if;
  insert into public.recordings (assignment_id, student_id, path, seconds) values (a.id, s.id, p_path, sec);
  if sec > 0 then
    insert into public.practice_sessions (student_id, started_at, ended_at, done, played_seconds, label)
    values (s.id, now() - make_interval(secs => sec), now(), true, sec, 'opname');
  end if;
end $$;

revoke execute on function public.cancel_lesson(uuid, date, text), public.move_lesson(uuid, date, date, time),
  public.add_holiday(text, date, date), public.remove_holiday(uuid) from public, anon;
grant execute on function public.cancel_lesson(uuid, date, text), public.move_lesson(uuid, date, date, time),
  public.add_holiday(text, date, date), public.remove_holiday(uuid) to authenticated;
