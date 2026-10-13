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
                   and m.joined_on <= public.lesson_end(l.id) and (m.left_on is null or m.left_on >= l.date));
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
create function public.set_schedule(p_group uuid, p_weekday smallint, p_start_time time) returns void
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
