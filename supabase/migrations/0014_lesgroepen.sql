-- Lesgroepen, lessen, opdrachten (AC-124, ontwerp docs/superpowers/specs/2026-10-12-opdrachten-over-lessen-design.md).
-- Het datamodel van Alwin: LESGROEP (privéles = groep van één, ouder = thuis-groep), GROEPSLID,
-- ROOSTERREGEL, LES, OPDRACHT bij de groep, HUISWERK (les × opdracht), VOORTGANG per leerling.
-- Vervangt homework/homework_tasks/task_recordings. De app op productie werkt daarna niet met huiswerk
-- tot develop naar main gaat.

alter table public.homework rename to homework_old;
alter table public.homework_tasks rename to homework_tasks_old;
alter table public.task_recordings rename to recordings_old;

create table public.lesson_groups (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  -- een leerling mag andermans profiel niet lezen; de naam staat daarom hier
  teacher_name text not null default '',
  kind text not null check (kind in ('les','thuis')),
  name text not null default '',
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.lesson_groups (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  joined_on date not null default current_date,
  left_on date,
  primary key (group_id, student_id)
);
create index on public.group_members (student_id);
create table public.schedule_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lesson_groups (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time,
  valid_from date not null default current_date,
  valid_until date
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lesson_groups (id) on delete cascade,
  schedule_rule_id uuid references public.schedule_rules (id) on delete set null,
  date date not null,
  start_time time,
  end_time time,
  status text not null default 'gepland' check (status in ('gepland','gegeven','afgezegd')),
  notes jsonb not null default '[]' check (jsonb_typeof(notes) = 'array'),
  minutes_per_day integer not null default 15 check (minutes_per_day between 1 and 180),
  days_per_week integer not null default 5 check (days_per_week between 1 and 7),
  remark text not null default '',
  created_at timestamptz not null default now(),
  unique (group_id, date)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.lesson_groups (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('stuk','opdracht')),
  title text not null,
  book_title text not null default '', book_author text not null default '',
  page text not null default '', chapter text not null default '', number text not null default '', track text not null default '',
  bank_id uuid references public.task_bank (id) on delete set null,
  sheet_path text, sheet_name text not null default '', example_path text,
  recording boolean not null default false,
  start_date date, deadline date,
  created_at timestamptz not null default now()
);
create table public.homework (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  position integer not null default 0,
  description text not null default '',
  unique (lesson_id, assignment_id)
);
create index on public.homework (assignment_id);
create table public.homework_done (
  homework_id uuid not null references public.homework (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (homework_id, student_id)
);
create table public.progress (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status text not null default 'bezig' check (status in ('bezig','klaar')),
  grade numeric(4,1),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  path text,
  seconds integer not null default 0 check (seconds between 0 and 300),
  submitted_at timestamptz not null default now(),
  deleted_at timestamptz,
  reaction_emoji text not null default '', reaction text not null default '', reacted_at timestamptz
);
create index on public.recordings (assignment_id, student_id, submitted_at);

-- ── Helpers ──────────────────────────────────────────────────────────
-- de docent of ouder van de groep, zolang hij bij elk huidig lid mag (na ontkoppelen niet meer)
create or replace function public.is_group_teacher(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lesson_groups g where g.id = gid and g.teacher_id = auth.uid())
     and not exists (select 1 from public.group_members m where m.group_id = gid and m.left_on is null and not public.can_access_student(m.student_id));
$$;
-- wie de groep mag zien: de docent of ouder van de groep, en wie bij een lid mag (leerling, ouder, andere leraar)
create or replace function public.can_see_group(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_group_teacher(gid) or public.is_admin()
      or exists (select 1 from public.group_members m where m.group_id = gid and public.can_access_student(m.student_id));
$$;
-- einde van de huiswerkperiode: de dag vóór de volgende niet-afgezegde les, anders een week
create or replace function public.lesson_end(p_lesson uuid) returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select min(n.date) - 1 from public.lessons n
                   where n.group_id = l.group_id and n.date > l.date and n.status <> 'afgezegd'), l.date + 6)
  from public.lessons l where l.id = p_lesson;
$$;
create or replace function public.lesson_visible(p_lesson uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lessons l where l.id = p_lesson
    and public.can_see_group(l.group_id) and (l.date <= current_date or public.is_group_teacher(l.group_id)));
$$;

-- ── Leesrechten ──────────────────────────────────────────────────────
alter table public.lesson_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.schedule_rules enable row level security;
alter table public.lessons enable row level security;
alter table public.assignments enable row level security;
alter table public.homework enable row level security;
alter table public.homework_done enable row level security;
alter table public.progress enable row level security;
alter table public.recordings enable row level security;
create policy "groepen lezen" on public.lesson_groups for select using (public.can_see_group(id));
create policy "leden lezen" on public.group_members for select using (public.can_see_group(group_id));
create policy "rooster lezen" on public.schedule_rules for select using (public.can_see_group(group_id));
create policy "lessen lezen" on public.lessons for select using (public.lesson_visible(id));
create policy "opdrachten lezen" on public.assignments for select using (
  public.is_group_teacher(group_id) or exists (select 1 from public.homework h where h.assignment_id = assignments.id and public.lesson_visible(h.lesson_id)));
create policy "huiswerk lezen" on public.homework for select using (public.lesson_visible(lesson_id));
create policy "vinkjes lezen" on public.homework_done for select using (
  public.can_access_student(student_id) or exists (select 1 from public.homework h join public.lessons l on l.id = h.lesson_id
    where h.id = homework_id and public.is_group_teacher(l.group_id)));
create policy "voortgang lezen" on public.progress for select using (
  public.can_access_student(student_id) or exists (select 1 from public.assignments a where a.id = assignment_id and public.is_group_teacher(a.group_id)));
create policy "opnames lezen" on public.recordings for select using (
  public.can_access_student(student_id) or public.is_admin()
  or exists (select 1 from public.assignments a where a.id = assignment_id and public.is_group_teacher(a.group_id)));
revoke insert, update, delete on public.lesson_groups, public.group_members, public.schedule_rules, public.lessons,
  public.assignments, public.homework, public.homework_done, public.progress, public.recordings from anon, authenticated;

-- ── Data overzetten: in een functie, zodat de test hem los kan aanroepen op voorbeelddata ──
create or replace function public.migrate_homework_to_lessons() returns void
language plpgsql security definer set search_path = public as $mig$
begin
create temp table if not exists _groep (group_id uuid, given_by uuid, student_id uuid) on commit drop;
truncate _groep;
insert into _groep (group_id, given_by, student_id)
select gen_random_uuid(), given_by, student_id from (select distinct given_by, student_id from public.homework_old) p;
insert into public.lesson_groups (id, teacher_id, teacher_name, kind)
select x.group_id, x.given_by,
       (select h.given_by_name from public.homework_old h where h.given_by = x.given_by and h.student_id = x.student_id order by created_at desc limit 1),
       case when (select h.given_by_role from public.homework_old h where h.given_by = x.given_by and h.student_id = x.student_id limit 1) = 'leraar' then 'les' else 'thuis' end
from _groep x;
insert into public.group_members (group_id, student_id, joined_on)
select x.group_id, x.student_id, (select min(h.start_date) from public.homework_old h where h.given_by = x.given_by and h.student_id = x.student_id)
from _groep x;
-- lesdag van de leerling wordt een roosterregel van zijn groepen
insert into public.schedule_rules (group_id, weekday, valid_from)
select x.group_id, s.lesson_weekday, current_date from _groep x join public.students s on s.id = x.student_id where s.lesson_weekday is not null;
-- één les per (groep, startdatum); bij meer oude huiswerken op dezelfde dag telt het nieuwste
insert into public.lessons (group_id, date, status, notes, minutes_per_day, days_per_week, remark, created_at)
select distinct on (x.group_id, h.start_date) x.group_id, h.start_date,
       case when h.start_date <= current_date then 'gegeven' else 'gepland' end,
       h.notes, h.minutes_per_day, h.days_per_week, h.remark, h.created_at
from public.homework_old h join _groep x on x.given_by = h.given_by and x.student_id = h.student_id
order by x.group_id, h.start_date, h.created_at desc;
-- opdrachten (zelfde id) en hun huiswerk in de les van die dag
insert into public.assignments (id, group_id, created_by, kind, title, book_title, book_author, page, chapter, number, track,
                                bank_id, sheet_path, sheet_name, example_path, recording, created_at)
select t.id, x.group_id, h.given_by, t.kind, t.title, t.book_title, t.book_author, t.page, t.chapter, t.number, t.track,
       t.bank_id, t.sheet_path, t.sheet_name, t.example_path, t.recording, t.created_at
from public.homework_tasks_old t join public.homework_old h on h.id = t.homework_id
join _groep x on x.given_by = h.given_by and x.student_id = h.student_id;
insert into public.homework (lesson_id, assignment_id, position)
select l.id, t.id, t.position from public.homework_tasks_old t join public.homework_old h on h.id = t.homework_id
join _groep x on x.given_by = h.given_by and x.student_id = h.student_id
join public.lessons l on l.group_id = x.group_id and l.date = h.start_date
on conflict (lesson_id, assignment_id) do nothing;
insert into public.homework_done (homework_id, student_id, done_at)
select hw.id, h.student_id, t.done_at from public.homework_tasks_old t join public.homework_old h on h.id = t.homework_id
join public.homework hw on hw.assignment_id = t.id where t.done_at is not null;
insert into public.recordings (id, assignment_id, student_id, path, seconds, submitted_at, deleted_at, reaction_emoji, reaction, reacted_at)
select r.id, r.task_id, h.student_id, r.path, r.seconds, r.submitted_at, r.deleted_at, r.reaction_emoji, r.reaction, r.reacted_at
from public.recordings_old r join public.homework_tasks_old t on t.id = r.task_id join public.homework_old h on h.id = t.homework_id;
-- het oude stuk-veld (van vóór de opdrachten) wordt een opdracht, vooraan in de les van die dag
with p as (
  select gen_random_uuid() as id, x.group_id, h.given_by, h.start_date,
         h.piece || case when h.piece_note <> '' then ', ' || h.piece_note else '' end as title
  from public.homework_old h join _groep x on x.given_by = h.given_by and x.student_id = h.student_id where trim(h.piece) <> ''
), nieuw as (
  insert into public.assignments (id, group_id, created_by, kind, title) select id, group_id, given_by, 'stuk', title from p returning id
)
insert into public.homework (lesson_id, assignment_id, position)
select l.id, p.id, -1 from p join public.lessons l on l.group_id = p.group_id and l.date = p.start_date
on conflict (lesson_id, assignment_id) do nothing;
end $mig$;
revoke execute on function public.migrate_homework_to_lessons() from public, anon, authenticated;
-- de echte data één keer overzetten; de _old-tabellen en deze functie gaan weg aan het eind van 0014 (Task 2)
select public.migrate_homework_to_lessons();

-- ── Groep, rooster, les ──────────────────────────────────────────────
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
  where g.teacher_id = me.id and m.student_id = p_student and m.left_on is null
    and (select count(*) from public.group_members x where x.group_id = g.id and x.left_on is null) = 1
  order by g.created_at limit 1;
  if gid is null then
    insert into public.lesson_groups (teacher_id, teacher_name, kind) values (me.id, me.display_name, case when me.role = 'leraar' then 'les' else 'thuis' end)
    returning id into gid;
    insert into public.group_members (group_id, student_id) values (gid, p_student);
  end if;
  return gid;
end $$;

create or replace function public.set_schedule(p_group uuid, p_weekday smallint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  update public.schedule_rules set valid_until = current_date - 1 where group_id = p_group and valid_until is null and valid_from < current_date;
  delete from public.schedule_rules where group_id = p_group and valid_from >= current_date;
  if p_weekday is not null then insert into public.schedule_rules (group_id, weekday) values (p_group, p_weekday); end if;
end $$;

-- de lesdag op of vóór (dir = -1) of na (dir = 1) een datum, volgens het rooster dat dan geldt
create or replace function public.scheduled_day(p_group uuid, p_from date, p_dir int) returns date
language sql stable security definer set search_path = public as $$
  select case when r.weekday is null then null
              when p_dir < 0 then p_from - ((extract(dow from p_from)::int - r.weekday + 7) % 7)
              else p_from + 1 + ((r.weekday - extract(dow from p_from + 1)::int + 7) % 7) end
  from (select (select weekday from public.schedule_rules where group_id = p_group and valid_from <= p_from
                and (valid_until is null or valid_until >= p_from) order by valid_from desc limit 1) as weekday) r;
$$;

create or replace function public.lesson_for(p_group uuid, p_which text) returns public.lessons
language plpgsql security definer set search_path = public as $$
declare l public.lessons; d date;
begin
  if not public.is_group_teacher(p_group) then raise exception 'geen toegang'; end if;
  if p_which = 'deze' then
    select * into l from public.lessons where group_id = p_group and date <= current_date and status <> 'afgezegd'
      and public.lesson_end(id) >= current_date order by date desc limit 1;
    d := coalesce(public.scheduled_day(p_group, current_date, -1), current_date);
  elsif p_which = 'volgende' then
    select * into l from public.lessons where group_id = p_group and date > current_date and status <> 'afgezegd' order by date limit 1;
    d := coalesce(public.scheduled_day(p_group, current_date, 1), current_date + 7);
  else raise exception 'ongeldige les'; end if;
  -- is de les op die dag gestopt (afgezegd), dan begint "deze les" vandaag opnieuw in plaats van de gestopte terug te halen
  if l.id is null and p_which = 'deze' and exists (select 1 from public.lessons where group_id = p_group and date = d and status = 'afgezegd') then
    d := current_date;
  end if;
  if l.id is null then
    -- staat er op die dag een gestopte les, dan begint die opnieuw: leeg, zonder het oude huiswerk
    delete from public.homework h using public.lessons x
      where h.lesson_id = x.id and x.group_id = p_group and x.date = d and x.status = 'afgezegd';
    update public.lessons set notes = '[]', remark = '' where group_id = p_group and date = d and status = 'afgezegd';
    insert into public.lessons (group_id, date, status) values (p_group, d, case when d <= current_date then 'gegeven' else 'gepland' end)
    on conflict (group_id, date) do update set status = case when excluded.date <= current_date then 'gegeven' else 'gepland' end
    returning * into l;
  end if;
  return l;
end $$;

-- opdrachten (jsonb, zelfde vorm als voorheen) aan de groep toevoegen en als huiswerk in een les zetten
create or replace function public.add_assignments(p_lesson uuid, p_tasks jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare t jsonb; b public.books; pos integer; aid uuid; l public.lessons; mine text := auth.uid()::text || '/';
begin
  select * into l from public.lessons where id = p_lesson;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 30 then raise exception 'ongeldige opdracht'; end if;
  select coalesce(max(position) + 1, 0) into pos from public.homework where lesson_id = p_lesson;
  for t in select * from jsonb_array_elements(p_tasks) loop
    if coalesce(t->>'kind', '') not in ('stuk','opdracht') or length(trim(coalesce(t->>'title', ''))) = 0
       or (nullif(t->>'sheet_path', '') is not null and not starts_with(t->>'sheet_path', mine))
       or (nullif(t->>'example_path', '') is not null and not starts_with(t->>'example_path', mine))
    then raise exception 'ongeldige opdracht'; end if;
    b := null;
    if t->>'book_id' is not null then select * into b from public.books where id = (t->>'book_id')::uuid and owner_id = auth.uid(); end if;
    insert into public.assignments (group_id, created_by, kind, title, book_title, book_author, page, chapter, number, track, bank_id,
                                    sheet_path, sheet_name, example_path, recording)
    values (l.group_id, auth.uid(), t->>'kind', left(trim(t->>'title'), 300), coalesce(b.title, ''), coalesce(b.author, ''),
            left(coalesce(t->>'page', ''), 20), left(coalesce(t->>'chapter', ''), 40), left(coalesce(t->>'number', ''), 20), left(coalesce(t->>'track', ''), 20),
            (select id from public.task_bank where id = nullif(t->>'bank_id', '')::uuid and owner_id = auth.uid()),
            nullif(t->>'sheet_path', ''), left(coalesce(t->>'sheet_name', ''), 200), nullif(t->>'example_path', ''),
            t->>'kind' = 'stuk' and coalesce((t->>'recording')::boolean, false))
    returning id into aid;
    insert into public.homework (lesson_id, assignment_id, position) values (p_lesson, aid, pos);
    pos := pos + 1;
  end loop;
end $$;
revoke execute on function public.add_assignments(uuid, jsonb) from public, anon, authenticated;

-- noten van de les komen bij elk lid op "in de les"; wat een kind al kent blijft
create or replace function public.notes_to_members(p_group uuid, p_notes jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.student_notes (student_id, note_id, status)
    select m.student_id, n, 'les' from public.group_members m, jsonb_array_elements_text(coalesce(p_notes, '[]')) n
    where m.group_id = p_group and m.left_on is null
  on conflict (student_id, note_id) do update set status = 'les', updated_at = now() where public.student_notes.status <> 'kent';
$$;
revoke execute on function public.notes_to_members(uuid, jsonb) from public, anon, authenticated;

drop function public.give_homework(uuid, jsonb, integer, integer, text, text, text, date);
create function public.give_homework(p_group uuid, p_which text, p_notes jsonb, p_minutes integer, p_days integer, p_remark text,
                                     p_tasks jsonb, p_carry uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.lessons; had boolean;
begin
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

create or replace function public.end_lesson(p_lesson uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.lessons where id = p_lesson and public.is_group_teacher(group_id)) then raise exception 'geen toegang'; end if;
  update public.lessons set status = 'afgezegd' where id = p_lesson;
end $$;

-- ── Leerling: vinkje, opnames; docent: voortgang en reactie ───────────
create or replace function public.member_of_lesson(p_homework uuid, p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.homework h join public.lessons l on l.id = h.lesson_id
                 join public.group_members m on m.group_id = l.group_id where h.id = p_homework and m.student_id = p_student);
$$;
create or replace function public.set_done(p_homework uuid, p_student uuid, p_done boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_student(p_student) or not public.member_of_lesson(p_homework, p_student) then raise exception 'geen toegang'; end if;
  if p_done then insert into public.homework_done (homework_id, student_id) values (p_homework, p_student) on conflict do nothing;
  else delete from public.homework_done where homework_id = p_homework and student_id = p_student; end if;
end $$;

create or replace function public.set_progress(p_assignment uuid, p_student uuid, p_status text, p_grade numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.assignments a where a.id = p_assignment and public.is_group_teacher(a.group_id)) then raise exception 'geen toegang'; end if;
  if p_status not in ('bezig','klaar') or (p_grade is not null and p_grade not between 1 and 10) then raise exception 'ongeldige voortgang'; end if;
  insert into public.progress (assignment_id, student_id, status, grade) values (p_assignment, p_student, p_status, p_grade)
  on conflict (assignment_id, student_id) do update set status = excluded.status, grade = excluded.grade, updated_at = now();
end $$;

drop function if exists public.submit_recording(uuid, text, integer);
create function public.submit_recording(p_assignment uuid, p_student uuid, p_path text, p_seconds integer default 0) returns void
language plpgsql security definer set search_path = public as $$
declare a public.assignments; s public.students; sec integer := least(greatest(coalesce(p_seconds, 0), 0), 300);
begin
  select * into a from public.assignments where id = p_assignment;
  select * into s from public.students where id = p_student;
  if a.id is null or s.id is null or auth.uid() is null or auth.uid() not in (s.user_id, s.owner_id)
     or not exists (select 1 from public.group_members m where m.group_id = a.group_id and m.student_id = s.id)
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

create or replace function public.delete_recording(p_recording uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r public.recordings; s public.students;
begin
  select * into r from public.recordings where id = p_recording;
  select * into s from public.students where id = r.student_id;
  if r.id is null or auth.uid() is null or auth.uid() not in (s.user_id, s.owner_id) then raise exception 'geen toegang'; end if;
  delete from public.recordings where id = p_recording;
  return r.path;
end $$;

create or replace function public.react_to_recording(p_recording uuid, p_emoji text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.recordings r join public.assignments a on a.id = r.assignment_id
                 where r.id = p_recording and public.is_group_teacher(a.group_id)) then raise exception 'geen toegang'; end if;
  update public.recordings set reaction_emoji = left(coalesce(p_emoji, ''), 16), reaction = left(coalesce(p_text, ''), 1000), reacted_at = now()
  where id = p_recording;
end $$;

-- ── Bewaartermijn: 4 weken na het einde van de laatste les van de opdracht ─
drop function public.expired_recordings();
create function public.expired_recordings() returns table (task_id uuid, path text)
language sql stable security definer set search_path = public as $$
  select r.id, r.path from public.recordings r
  where r.path is not null
    -- een opdracht die in geen les meer staat: vanaf het insturen
    and coalesce((select max(public.lesson_end(h.lesson_id)) from public.homework h where h.assignment_id = r.assignment_id), r.submitted_at::date) + 28 < current_date;
$$;
create or replace function public.mark_recordings_deleted(p_tasks uuid[]) returns void
language sql security definer set search_path = public as $$
  update public.recordings set path = null, deleted_at = now() where id = any (p_tasks) and path is not null;
$$;

-- ── Bibliotheek toewijzen: bij de lopende les van mijn groep ─────────
create or replace function public.assign_tasks(p_students uuid[], p_bank_ids uuid[], p_due date)
returns integer language plpgsql security definer set search_path = public as $$
declare sid uuid; l public.lessons; tasks jsonb; n integer := 0;
begin
  if p_students is null or cardinality(p_students) = 0 or p_bank_ids is null or cardinality(p_bank_ids) = 0 then raise exception 'ongeldig huiswerk'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'book_id', book_id, 'page', page, 'chapter', chapter,
                                               'number', number, 'track', track, 'bank_id', id, 'sheet_path', sheet_path, 'sheet_name', sheet_name,
                                               'example_path', example_path, 'recording', recording) order by array_position(p_bank_ids, id)), '[]')
    into tasks from public.task_bank where id = any (p_bank_ids) and owner_id = auth.uid();
  if jsonb_array_length(tasks) = 0 then raise exception 'geen toegang'; end if;
  foreach sid in array p_students loop
    l := public.lesson_for(public.ensure_group(sid), 'deze');
    perform public.add_assignments(l.id, tasks);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ── Storage ──────────────────────────────────────────────────────────
drop policy "bladmuziek lezen" on storage.objects;
create policy "bladmuziek lezen" on storage.objects for select to authenticated using (bucket_id = 'bladmuziek' and (
  (storage.foldername(name))[1] = auth.uid()::text
  or exists (select 1 from public.assignments a where (a.sheet_path = name or a.example_path = name) and public.can_see_group(a.group_id))));
drop policy "opname verwijderen" on storage.objects;
create policy "opname verwijderen" on storage.objects for delete to authenticated
  using (bucket_id = 'opnames' and public.can_access_student(public.uuid_or_null((storage.foldername(name))[1]))
         and not exists (select 1 from public.recordings r where r.path = name));

-- ── Het oude model opruimen ──────────────────────────────────────────
drop function if exists public.give_homework_many(uuid[], jsonb, integer, integer, text, text, text, date);
drop function if exists public.give_homework_with_tasks(uuid[], jsonb, integer, integer, text, date, jsonb);
drop function if exists public.give_for_lesson(uuid[], text, jsonb, integer, integer, text, jsonb);
drop function if exists public.update_homework(uuid, jsonb, integer, integer, text, date, date, jsonb);
drop function if exists public.end_homework(uuid);
drop function if exists public.lesson_period(uuid, text);
drop function if exists public.set_task_done(uuid, boolean);
drop function if exists public.react_to_task(uuid, text, text);
drop function if exists public.sync_latest_recording(uuid);
drop function if exists public.add_homework_tasks(uuid, jsonb);
drop table public.recordings_old, public.homework_tasks_old, public.homework_old;
-- migrate_homework_to_lessons blijft bestaan (alleen voor de test); hij leest van tabellen die er dan niet meer zijn en doet niets zonder die
alter table public.students drop column lesson_weekday;

revoke execute on function public.ensure_group(uuid), public.set_schedule(uuid, smallint), public.lesson_for(uuid, text),
  public.give_homework(uuid, text, jsonb, integer, integer, text, jsonb, uuid[]), public.update_lesson(uuid, jsonb, integer, integer, text, date, jsonb),
  public.end_lesson(uuid), public.set_done(uuid, uuid, boolean), public.set_progress(uuid, uuid, text, numeric),
  public.submit_recording(uuid, uuid, text, integer) from public, anon;
grant execute on function public.ensure_group(uuid), public.set_schedule(uuid, smallint), public.lesson_for(uuid, text),
  public.give_homework(uuid, text, jsonb, integer, integer, text, jsonb, uuid[]), public.update_lesson(uuid, jsonb, integer, integer, text, date, jsonb),
  public.end_lesson(uuid), public.set_done(uuid, uuid, boolean), public.set_progress(uuid, uuid, text, numeric),
  public.submit_recording(uuid, uuid, text, integer) to authenticated;
revoke execute on function public.expired_recordings() from public, anon, authenticated;
grant execute on function public.expired_recordings() to service_role;
