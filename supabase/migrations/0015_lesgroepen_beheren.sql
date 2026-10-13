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
