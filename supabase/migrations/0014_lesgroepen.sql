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
create or replace function public.is_group_teacher(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lesson_groups g where g.id = gid and g.teacher_id = auth.uid());
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
  public.is_group_teacher(group_id) or exists (select 1 from public.homework h where h.assignment_id = id and public.lesson_visible(h.lesson_id)));
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
