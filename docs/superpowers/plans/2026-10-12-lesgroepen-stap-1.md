# Lesgroepen, lessen en opdrachten, stap 1: bouwplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het datamodel van Alwin (lesgroep, rooster, les, opdracht, huiswerk, voortgang) vervangt `homework`/`homework_tasks`. De bestaande schermen werken erop, en een opdracht kan meegaan naar de volgende les met behoud van opnames.

**Architecture:**
- **Database:** één migratie `0014_lesgroepen.sql` maakt de nieuwe tabellen, zet de bestaande data over, vervangt de functies en ruimt het oude model op.
- **Client:** de client levert de schermen een gemaksvorm. `Homework` wordt dan "één les met het huiswerk voor deze leerling", zodat Vandaag, de taakpagina en de huiswerkkaart weinig veranderen.
- **Erbij:** meegaan ("Loopt nog"), het label "2e week", en opnames per week.

**Tech Stack:** Supabase (Postgres, PL/pgSQL, RLS, pgTAP via `supabase test db` met CLI 2.120), TypeScript client (`packages/client`, vitest), React en Vite (`apps/web`), Playwright WebKit e2e (`apps/e2e`, tegen lokale Supabase).

**Spec:** `docs/superpowers/specs/2026-10-12-opdrachten-over-lessen-design.md`

## Global Constraints

- Tabelnamen in het Engels: `lesson_groups`, `group_members`, `schedule_rules`, `lessons`, `assignments`, `homework`, `homework_done`, `progress`, `recordings`.
- Schrijven gaat alleen via `security definer`-functies. Elke functie controleert de rechten. RLS geeft alleen leesrechten.
- Een les die nog moet komen (`date > current_date`), ziet alleen de docent of ouder van de groep (`teacher_id = auth.uid()`).
- Een privéles is een lesgroep met één leerling. Een ouder heeft een groep van `kind = 'thuis'`.
- Opnamepaden blijven `<student_id>/<assignment_id>/<naam>` (de bestaande paden gebruiken het oude task-id, dat het assignment-id wordt).
- `purge-recordings` blijft ongewijzigd: `expired_recordings()` geeft `(task_id uuid, path text)` terug, waarbij `task_id` nu het id van de opname is, en `mark_recordings_deleted(p_tasks uuid[])` krijgt opname-ids.
- Een opname telt als oefensessie (`practice_sessions.label = 'opname'`, hooguit 300 s), zoals in 0012.
- Teksten in de app en in commentaar zijn Nederlands, in de stijl van de bestaande code.
- Commits eindigen met de Co-Authored-By- en Claude-Session-regels uit de sessie.

## Review Focus

1. **Annabel-geval:** twee of drie oude huiswerken van dezelfde gever met dezelfde startdatum. De migratie voegt die samen tot één les (uniek `group_id, date`), zonder opdrachten, vinkjes of opnames te verliezen. Getest in Task 1.
2. **Groepsles met twee leerlingen:** het vinkje en de opnames van leerling A zijn niet zichtbaar of telbaar voor leerling B. Getest in Task 2.
3. **Meegaan zonder dubbel:** een opdracht twee keer meenemen naar dezelfde les maakt geen tweede huiswerkregel (`on conflict do nothing`). Getest in Task 2.
4. **Een opdracht weghalen bij aanpassen**, terwijl hij ook in een andere les staat of opnames heeft: de opdracht blijft bestaan, alleen de huiswerkregel van deze les gaat weg. Getest in Task 2.
5. **Een afgezegde les** ("Huiswerk stoppen") telt niet als lopende les. "Deze les" valt dan terug op de vorige lopende les, of maakt een nieuwe aan. Getest in Task 2.

---

## Bestanden

| Bestand | Wat |
|---|---|
| `supabase/migrations/0014_lesgroepen.sql` | **nieuw:** tabellen, RLS, data overzetten, functies, opruimen |
| `supabase/tests/lesgroepen.test.sql` | **nieuw:** het model en de functies |
| `supabase/tests/{huiswerk,opdrachten,opnames,meerdere-opnames,huiswerk-per-les,sjablonen}.test.sql` | omzetten naar het nieuwe model; tests die alleen het oude model testen vervallen |
| `packages/client/src/types.ts` | `Homework` wordt de les-gemaksvorm (+`groupId`, `status`); `HomeworkTask` + `homeworkItemId`, `week`, `weeks`; API-wijzigingen |
| `packages/client/src/lessons.ts` (**nieuw**) + `lessons.test.ts` | pure helpers: `lessonEnd`, `weekOf`, `recordingsPerWeek` |
| `packages/client/src/homework.ts` | `currentHomework`/`upcomingHomework`/`homeworkProgress` op de gemaksvorm (afgezegd telt niet) |
| `packages/client/src/supabase.ts` | `homework.list` uit `group_members → lesson_groups → lessons → homework`; nieuwe RPC's |
| `packages/client/src/local.ts` | lokale client volgt de gemaksvorm (één thuis-groep) |
| `apps/web/src/screens/HuiswerkGeven.tsx` | `give`/`update` met `carry`; blok "Loopt nog" |
| `apps/web/src/screens/Taak.tsx`, `components/Opdrachten.tsx`, `components/Huiswerk.tsx`, `screens/Vandaag.tsx`, `lib/vandaag.ts` | `setTaskDone(homeworkItemId, studentId, done)`, `submitRecording(assignmentId, studentId, …)`, "2e week", opnames per week |
| `apps/web/src/components/LeerlingenTabel.tsx`, `screens/Opdrachtenbank.tsx` | "Herhalen" = volgende les met alles mee; toewijzen ongewijzigd (`assign_tasks`) |
| `apps/e2e/tests/opdracht-meenemen.spec.ts` | **nieuw** |

---

### Task 1: Migratie, deel 1: tabellen, RLS en data overzetten

**Files:**
- Create: `supabase/migrations/0014_lesgroepen.sql` (bovenste helft: tabellen, helpers, RLS, data overzetten; de functies komen in Task 2 onderaan hetzelfde bestand)
- Create: `supabase/tests/lesgroepen.test.sql` (deel "model en overzetten")

**Interfaces:**
- Produces:
  - tabellen zoals in de spec;
  - `public.is_group_teacher(gid uuid) returns boolean`;
  - `public.can_see_group(gid uuid) returns boolean`;
  - `public.lesson_end(p_lesson uuid) returns date`.

- [ ] **Step 1: Schrijf de test voor het schema (faalt: tabellen bestaan niet).** Voeg aan `lesgroepen.test.sql` toe, met de opzet (`pg_temp.als`, `ids`) zoals in `huiswerk-per-les.test.sql`. Het overzetten test je in Step 4.

```sql
select has_table('public', 'lesson_groups', 'lesgroepen');
select has_table('public', 'lessons', 'lessen');
select has_table('public', 'assignments', 'opdrachten');
select has_table('public', 'homework', 'huiswerk (les × opdracht)');
select hasnt_table('public', 'homework_tasks', 'oude opdrachten weg');
select hasnt_table('public', 'task_recordings', 'oude opnames weg');
select col_is_unique('public', 'lessons', array['group_id','date'], 'één les per groep per dag');
```

- [ ] **Step 2: Draai het om te zien dat het faalt.**
  - Run: `npx -y supabase@2.120.0 db reset --local && npx -y supabase@2.120.0 test db supabase/tests/lesgroepen.test.sql`
  - Expected: FAIL op `has_table … lesgroepen`.

- [ ] **Step 3: Schrijf de bovenste helft van `0014_lesgroepen.sql`.**

```sql
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
```

Daarna volgt de inhoud van de functie (dit is het hele overzetten):

```sql
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
-- het oude stuk-veld (van vóór de opdrachten) wordt een opdracht
insert into public.assignments (group_id, created_by, kind, title)
select x.group_id, h.given_by, 'stuk', h.piece || case when h.piece_note <> '' then ', ' || h.piece_note else '' end
from public.homework_old h join _groep x on x.given_by = h.given_by and x.student_id = h.student_id where trim(h.piece) <> '';
end $mig$;
revoke execute on function public.migrate_homework_to_lessons() from public, anon, authenticated;
-- de echte data één keer overzetten; de _old-tabellen en deze functie gaan weg aan het eind van 0014 (Task 2)
select public.migrate_homework_to_lessons();
```

> `_groep` is een `temp table … on commit drop`. Maak hem in de functie met `create temp table if not exists` en leeg hem eerst (`truncate`), zodat de functie twee keer kan draaien (migratie en test).

- [ ] **Step 4: Test het overzetten op voorbeelddata.** Maak in `lesgroepen.test.sql` (als `postgres`, binnen de transactie van de test) de tabellen `homework_old`, `homework_tasks_old` en `recordings_old` opnieuw aan, met de kolommen zoals in 0005, 0010, 0011, 0012 en 0013. Vul ze met het Annabel-geval: drie huiswerken van Marieke voor Lotte op dezelfde startdatum, drie opdrachten, één afgevinkt, twee opnames bij één opdracht. Roep `select public.migrate_homework_to_lessons();` aan en controleer:

```sql
select is((select count(*)::int from lessons l join group_members m using (group_id) where m.student_id = (select id from ids where naam = 'kind')), 1, 'Drie oude huiswerken op één dag worden één les');
select is((select count(*)::int from homework hw join lessons l on l.id = hw.lesson_id join group_members m using (group_id) where m.student_id = (select id from ids where naam = 'kind')), 3, 'Alle drie de opdrachten staan in die les');
select is((select count(*)::int from homework_done), 1, 'Het vinkje gaat mee');
select is((select count(*)::int from recordings), 2, 'De twee opnames gaan mee, bij dezelfde opdracht');
```

- [ ] **Step 5: Draai het om te zien dat het slaagt.**
  - Run: `npx -y supabase@2.120.0 db reset --local && npx -y supabase@2.120.0 test db supabase/tests/lesgroepen.test.sql`
  - Expected: PASS.

- [ ] **Step 6: Commit:** `git add supabase && git commit` ("0014 deel 1: lesgroepen, lessen, opdrachten, huiswerk, voortgang; data overzetten").

### Task 2: Migratie, deel 2: functies, storage, en het oude model opruimen

**Files:**
- Modify: `supabase/migrations/0014_lesgroepen.sql` (onderste helft)
- Modify: `supabase/tests/lesgroepen.test.sql` (deel "functies")
- Modify: de bestaande tests (`huiswerk`, `opdrachten`, `opnames`, `meerdere-opnames`, `huiswerk-per-les`, `sjablonen`). Zet ze om naar de nieuwe functies, of laat checks vallen die alleen het oude model testen. Reken het `plan(n)` opnieuw uit.

**Interfaces:**
- Consumes: de tabellen en helpers uit Task 1.
- Produces (RPC's die de client aanroept):
  - `ensure_group(p_student uuid) returns uuid`
  - `set_schedule(p_group uuid, p_weekday smallint) returns void`
  - `lesson_for(p_group uuid, p_which text) returns public.lessons`, met `'deze'` of `'volgende'`
  - `give_homework(p_group uuid, p_which text, p_notes jsonb, p_minutes int, p_days int, p_remark text, p_tasks jsonb, p_carry uuid[]) returns uuid`, dat het les-id teruggeeft
  - `update_lesson(p_lesson uuid, p_notes jsonb, p_minutes int, p_days int, p_remark text, p_date date, p_tasks jsonb) returns void`
  - `end_lesson(p_lesson uuid) returns void`
  - `set_done(p_homework uuid, p_student uuid, p_done boolean) returns void`
  - `set_progress(p_assignment uuid, p_student uuid, p_status text, p_grade numeric) returns void`
  - `submit_recording(p_assignment uuid, p_student uuid, p_path text, p_seconds int) returns void`
  - `delete_recording(p_recording uuid) returns text`
  - `react_to_recording(p_recording uuid, p_emoji text, p_text text) returns void`
  - `assign_tasks(p_students uuid[], p_bank_ids uuid[], p_due date) returns int` (de handtekening blijft)
  - `expired_recordings() returns table (task_id uuid, path text)`
  - `mark_recordings_deleted(p_tasks uuid[]) returns void`

- [ ] **Step 1: Schrijf de failing tests in `lesgroepen.test.sql`.** Elke check hieronder is één regel pgTAP. Gebruik als personen Marieke (leraar), Olaf (ouder), Lotte en Sem (leerlingen), en een vreemde.

```sql
-- groep en les
select pg_temp.als((select id from ids where naam = 'marieke'));
select isnt(ensure_group((select id from ids where naam = 'lotte')), null, 'Privégroep voor Lotte');
select is(ensure_group((select id from ids where naam = 'lotte')), ensure_group((select id from ids where naam = 'lotte')), 'Tweede keer dezelfde groep');
select is((select kind from lesson_groups limit 1), 'les', 'Groep van een leraar is een les');
select throws_ok($$ select ensure_group((select id from ids where naam = 'vreemd_kind')) $$, 'P0001', 'geen toegang', 'Alleen eigen leerlingen');
-- deze en volgende les, zonder rooster
select is((lesson_for(<groep>, 'deze')).date, current_date, 'Zonder rooster: deze les is vandaag');
select is((lesson_for(<groep>, 'volgende')).date, current_date + 7, 'De volgende les over een week');
-- met rooster (lesdag eergisteren)
select lives_ok($$ select set_schedule(<groep>, extract(dow from current_date - 2)::smallint) $$, 'Lesdag instellen');
-- huiswerk geven en meenemen
select isnt(give_homework(<groep>, 'deze', '["g4"]', 15, 5, '', jsonb_build_array(jsonb_build_object('kind','stuk','title','Lang zal ze leven','recording',true)), '{}'), null, 'Huiswerk voor deze les');
-- Lotte neemt op (twee opnames), daarna meenemen naar de volgende les
select lives_ok($$ select give_homework(<groep>, 'volgende', '[]', 15, 5, '', '[]', array[<opdracht>]) $$, 'Stuk gaat mee');
select is((select count(*)::int from homework where assignment_id = <opdracht>), 2, 'Dezelfde opdracht in twee lessen');
select lives_ok($$ select give_homework(<groep>, 'volgende', '[]', 15, 5, '', '[]', array[<opdracht>]) $$, 'Nog eens meenemen');
select is((select count(*)::int from homework where assignment_id = <opdracht>), 2, 'Geen dubbele huiswerkregel');
select is((select count(*)::int from recordings where assignment_id = <opdracht>), 2, 'De opnames blijven bij de opdracht');
-- volgende les onzichtbaar voor Lotte
select pg_temp.als((select id from ids where naam = 'lotte'));
select is((select count(*)::int from lessons where date > current_date), 0, 'Lotte ziet de volgende les nog niet');
-- groepsles: Sem erbij (via de docent, nog zonder UI: insert als postgres in de test)
-- vinkje per leerling
select lives_ok($$ select set_done(<huiswerk>, (select id from ids where naam = 'lotte'), true) $$, 'Lotte vinkt af');
select pg_temp.als((select id from ids where naam = 'sem'));
select is((select count(*)::int from homework_done), 0, 'Sem ziet het vinkje van Lotte niet');
select is((select count(*)::int from recordings), 0, 'en ook haar opnames niet');
-- aanpassen: weghalen uit deze les houdt de opdracht en zijn opnames
select pg_temp.als((select id from ids where naam = 'marieke'));
select lives_ok($$ select update_lesson(<deze les>, '[]', 15, 5, '', <datum>, '[]') $$, 'Alles weghalen uit deze les');
select is((select count(*)::int from assignments where id = <opdracht>), 1, 'De opdracht blijft (staat ook in de volgende les)');
-- stoppen
select lives_ok($$ select end_lesson(<deze les>) $$, 'Huiswerk stoppen');
select is((lesson_for(<groep>, 'deze')).status, 'gepland', 'Deze les valt terug op een nieuwe of vorige lopende les');
-- voortgang
select lives_ok($$ select set_progress(<opdracht>, (select id from ids where naam = 'lotte'), 'klaar', 8.5) $$, 'Voortgang zetten');
select pg_temp.als((select id from ids where naam = 'olaf'));
select throws_ok($$ select set_progress(<opdracht>, (select id from ids where naam = 'lotte'), 'klaar', 9) $$, 'P0001', 'geen toegang', 'Alleen de docent');
-- bewaartermijn over lessen
reset role;
update lessons set date = current_date - 60;
select is((select count(*)::int from expired_recordings()), 0, 'Alleen verlopen als de laatste les ook voorbij is');
```

> Vervang `<groep>`, `<opdracht>`, `<huiswerk>`, `<deze les>` en `<datum>` door `(select id from ids where naam = '…')`, en vul `ids` direct na de aanroepen (`insert into ids select 'groep', ensure_group(…)`), zoals de bestaande tests dat doen.

- [ ] **Step 2: Draai het om te zien dat het faalt.**
  - Run: `npx -y supabase@2.120.0 db reset --local && npx -y supabase@2.120.0 test db supabase/tests/lesgroepen.test.sql`
  - Expected: FAIL op `function ensure_group(uuid) does not exist`.

- [ ] **Step 3: Schrijf de onderste helft van `0014_lesgroepen.sql`.**

```sql
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
  if l.id is null then
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
    and (select max(public.lesson_end(h.lesson_id)) from public.homework h where h.assignment_id = r.assignment_id) + 28 < current_date;
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
```

- [ ] **Step 4: Zet de bestaande tests om.**
  - `huiswerk.test.sql` en `sjablonen.test.sql`: `give_homework(student, …)` en `give_homework_many` worden `give_homework(ensure_group(student), 'deze', …, '[]', '{}')`; tellingen op `homework` worden tellingen op `lessons`.
  - `opdrachten.test.sql`: `give_homework_with_tasks` en `set_task_done` worden `give_homework` en `set_done`.
  - `opnames.test.sql` en `meerdere-opnames.test.sql`: `submit_recording(task, path)` wordt `submit_recording(assignment, student, path, seconds)`; `react_to_task` en de checks op de oude kolommen vervallen.
  - `huiswerk-per-les.test.sql`: lesperiode en meegaan staan nu in `lesgroepen.test.sql`. Zet over wat nog geldt (aanpassen houdt het vinkje, stoppen) en verwijder de rest.

- [ ] **Step 5: Draai alles om te zien dat het slaagt.**
  - Run: `npx -y supabase@2.120.0 db reset --local && npx -y supabase@2.120.0 test db`
  - Expected: `Result: PASS`.

- [ ] **Step 6: Commit** ("0014 deel 2: functies voor lesgroepen, meegaan, voortgang; oude model weg").

### Task 3: Client: types en pure helpers

**Files:**
- Modify: `packages/client/src/types.ts`
- Create: `packages/client/src/lessons.ts`, `packages/client/src/lessons.test.ts`
- Modify: `packages/client/src/index.ts` (exports)

**Interfaces:**
- Produces:

```ts
// types.ts
export interface Homework {            // gemaksvorm: één les met het huiswerk voor één leerling
  id: string;                          // les-id
  groupId: string;
  studentId: string;
  givenBy: string; givenByRole: "ouder" | "leraar"; givenByName: string;
  createdAt: string;
  startDate: string;                   // lessons.date
  dueDate: string;                     // einde huiswerkperiode (lessonEnd)
  status: "gepland" | "gegeven" | "afgezegd";
  minutesPerDay: number; daysPerWeek: number; notes: NoteId[]; remark: string;
  piece: string; pieceNote: string;    // altijd "" (oud veld, voor homeworkProgress)
  tasks: HomeworkTask[];
}
export interface HomeworkTask {        // opdracht + zijn huiswerkregel in deze les, voor deze leerling
  id: string;                          // assignment-id
  homeworkId: string;                  // les-id (zoals voorheen)
  homeworkItemId: string;              // homework.id (les × opdracht)
  position: number; kind: TaskKind; title: string; bookTitle: string; bookAuthor: string;
  page: string; chapter: string; number: string; track: string;
  doneAt: string | null;               // vinkje van deze leerling in deze les
  sheetPath: string | null; sheetName: string; examplePath: string | null; recording: boolean;
  recordings: TaskRecording[];         // van deze leerling, alle weken
  progress: { status: "bezig" | "klaar"; grade: number | null } | null;   // voortgang van deze leerling
  week: number;                        // 1 = eerste les waarin deze opdracht staat
  weeks: LessonSpan[];                 // alle lessen van de opdracht, oudste eerst
}
export interface LessonSpan { lessonId: string; start: string; end: string }
// TaskRecording: id, taskId (= assignmentId), path, submittedAt, deletedAt, reactionEmoji, reaction, reactedAt (zoals nu)

// HomeworkApi
list(studentId: string, limit?: number): Promise<Homework[]>;   // lessen van alle groepen van de leerling
give(studentIds: string[], which: Lesson, input: { notes: NoteId[]; minutesPerDay: number; daysPerWeek: number; remark: string },
     tasks: TaskInput[], carry?: Record<string, string[]>): Promise<number>;   // carry per leerling: assignment-ids
update(lessonId: string, input: { notes: NoteId[]; minutesPerDay: number; daysPerWeek: number; remark: string; startDate: string }, tasks: TaskInput[]): Promise<void>;
end(lessonId: string): Promise<void>;
setTaskDone(homeworkItemId: string, studentId: string, done: boolean): Promise<void>;
submitRecording(assignmentId: string, studentId: string, path: string, seconds: number): Promise<void>;
setSchedule(studentId: string, weekday: number | null): Promise<void>;    // via ensure_group + set_schedule
schedule(studentId: string): Promise<number | null>;                      // de lesdag van mijn groep met deze leerling
setProgress(assignmentId: string, studentId: string, status: "bezig" | "klaar", grade: number | null): Promise<void>;
// weg: give(input), giveMany, giveWithTasks, giveForLesson
```

```ts
// lessons.ts
export function lessonEnd(lessonDates: string[], date: string): string;              // dag vóór de volgende (niet-afgezegde) les, anders date + 6
export function weekOf(spans: LessonSpan[], lessonId: string): number;               // 1-based positie
export function recordingsPerWeek(rec: TaskRecording[], spans: LessonSpan[]): Array<{ span: LessonSpan | null; recordings: TaskRecording[] }>;  // nieuwste week eerst; buiten elke les → span null
```

- [ ] **Step 1: Schrijf de failing tests (`lessons.test.ts`).**

```ts
import { describe, expect, it } from "vitest";
import { lessonEnd, recordingsPerWeek, weekOf } from "./lessons.js";
import type { LessonSpan, TaskRecording } from "./types.js";

const span = (lessonId: string, start: string, end: string): LessonSpan => ({ lessonId, start, end });
const rec = (id: string, submittedAt: string): TaskRecording => ({ id, taskId: "a", path: "p", submittedAt, deletedAt: null, reactionEmoji: "", reaction: "", reactedAt: null });

describe("lessonEnd", () => {
  it("de dag vóór de volgende les", () => expect(lessonEnd(["2026-10-06", "2026-10-13"], "2026-10-06")).toBe("2026-10-12"));
  it("zonder volgende les een week", () => expect(lessonEnd(["2026-10-13"], "2026-10-13")).toBe("2026-10-19"));
});
describe("weekOf", () => {
  it("telt de lessen van de opdracht", () => {
    const s = [span("a", "2026-10-06", "2026-10-12"), span("b", "2026-10-13", "2026-10-19")];
    expect(weekOf(s, "a")).toBe(1); expect(weekOf(s, "b")).toBe(2);
  });
});
describe("recordingsPerWeek", () => {
  it("groepeert per les, nieuwste week eerst", () => {
    const s = [span("a", "2026-10-06", "2026-10-12"), span("b", "2026-10-13", "2026-10-19")];
    const g = recordingsPerWeek([rec("1", "2026-10-08T10:00:00Z"), rec("2", "2026-10-14T10:00:00Z"), rec("3", "2026-10-09T10:00:00Z")], s);
    expect(g.map((x) => [x.span?.lessonId, x.recordings.map((r) => r.id)])).toEqual([["b", ["2"]], ["a", ["3", "1"]]]);
  });
});
```

- [ ] **Step 2:** Run `pnpm --filter @notenkraker/client test`. Expected: FAIL (`lessons.js` ontbreekt).

- [ ] **Step 3: Schrijf `lessons.ts`.**

```ts
import { dateKey } from "./dashboard.js";
import type { LessonSpan, TaskRecording } from "./types.js";

/** Les en huiswerkperiode (AC-124): een les loopt tot de dag vóór de volgende les van de groep, anders een week. */
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return dateKey(d); };

export function lessonEnd(lessonDates: string[], date: string): string {
  const next = lessonDates.filter((d) => d > date).sort()[0];
  return next ? addDays(next, -1) : addDays(date, 6);
}

export function weekOf(spans: LessonSpan[], lessonId: string): number {
  return [...spans].sort((a, b) => a.start.localeCompare(b.start)).findIndex((s) => s.lessonId === lessonId) + 1;
}

/** opnames per week (de les in wiens periode ze vallen), nieuwste week eerst en binnen een week nieuwste eerst */
export function recordingsPerWeek(recordings: TaskRecording[], spans: LessonSpan[]) {
  const sorted = [...spans].sort((a, b) => b.start.localeCompare(a.start));
  const groups = new Map<LessonSpan | null, TaskRecording[]>();
  for (const r of [...recordings].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))) {
    const day = dateKey(new Date(r.submittedAt));
    const span = sorted.find((s) => s.start <= day && day <= s.end) ?? null;
    groups.set(span, [...(groups.get(span) ?? []), r]);
  }
  return [...sorted, null].filter((s) => groups.has(s)).map((span) => ({ span, recordings: groups.get(span)! }));
}
```

- [ ] **Step 4:** Werk de types bij zoals onder Interfaces. Exporteer `lessonEnd`, `weekOf`, `recordingsPerWeek` en `LessonSpan` in `index.ts`. Run `pnpm --filter @notenkraker/client test`. Expected: de nieuwe tests PASS. Typecheck faalt nog in `supabase.ts` en `local.ts`; dat is Task 4.

- [ ] **Step 5: Commit** ("client: types en helpers voor lessen en opdrachten").

### Task 4: Client: Supabase en lokaal

**Files:**
- Modify: `packages/client/src/supabase.ts` (homework-API), `packages/client/src/local.ts`, `packages/client/src/homework.ts` (+ test)

**Interfaces:**
- Consumes: types en helpers uit Task 3, en de RPC's uit Task 2.
- Produces: `client.homework.*` zoals in Task 3.

- [ ] **Step 1: Test in `homework.test.ts`:** `currentHomework` slaat afgezegde lessen over.

```ts
it("een afgezegde les telt niet", () => {
  expect(currentHomework([hw({ status: "afgezegd" })], now)).toEqual([]);
});
```

  Pas `hw()` in die test aan: `groupId: "g1", status: "gegeven"`. Run, Expected: FAIL.

- [ ] **Step 2:** In `homework.ts`, voeg aan `currentHomework` en `upcomingHomework` het filter `h.status !== "afgezegd"` toe. Run, Expected: PASS.

- [ ] **Step 3: `supabase.ts`, `homework.list(studentId)`.**

```ts
async list(studentId) {
  const { data, error } = await sb.from("group_members")
    .select("lesson_groups(id, teacher_id, teacher_name, kind, lessons(*, homework(id, position, assignment_id, homework_done(student_id, done_at), assignments(*, recordings(*), homework(lesson_id, lessons(id, date, status))))))")
    .eq("student_id", studentId);
  if (error) throw error;
  const out: Homework[] = [];
  for (const m of data ?? []) {
    const g = (m as Record<string, any>).lesson_groups;
    if (!g) continue;
    const lessons = (g.lessons ?? []) as Array<Record<string, any>>;
    const dates = lessons.filter((l) => l.status !== "afgezegd").map((l) => l.date as string);
    for (const l of lessons) {
      out.push({
        id: l.id, groupId: g.id, studentId, givenBy: g.teacher_id, givenByRole: g.kind === "les" ? "leraar" : "ouder", givenByName: g.teacher_name,
        createdAt: l.created_at, startDate: l.date, dueDate: lessonEnd(dates, l.date), status: l.status,
        minutesPerDay: l.minutes_per_day, daysPerWeek: l.days_per_week, notes: l.notes ?? [], remark: l.remark ?? "", piece: "", pieceNote: "",
        tasks: (l.homework ?? []).map((h: Record<string, any>) => rowToTask(h, l.id, studentId)).sort((a: HomeworkTask, b: HomeworkTask) => a.position - b.position),
      });
    }
  }
  return out.sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 50);
},
```

```ts
const rowToTask = (h: Record<string, any>, lessonId: string, studentId: string): HomeworkTask => {
  const a = h.assignments;
  const spans: LessonSpan[] = (a.homework ?? []).map((x: Record<string, any>) => x.lessons).filter((x: any) => x && x.status !== "afgezegd")
    .map((x: Record<string, any>) => ({ lessonId: x.id, start: x.date, end: x.date })).sort((p: LessonSpan, q: LessonSpan) => p.start.localeCompare(q.start));
  // einde van elke week: de dag vóór de volgende les van de opdracht (benadering; de les van de groep is leidend in Homework.dueDate)
  spans.forEach((s, i) => { s.end = spans[i + 1] ? lessonEnd([spans[i + 1]!.start], s.start) : lessonEnd([], s.start); });
  return {
    id: a.id, homeworkId: lessonId, homeworkItemId: h.id, position: h.position, kind: a.kind, title: a.title, bookTitle: a.book_title ?? "", bookAuthor: a.book_author ?? "",
    page: a.page ?? "", chapter: a.chapter ?? "", number: a.number ?? "", track: a.track ?? "",
    doneAt: ((h.homework_done ?? []) as Array<Record<string, any>>).find((d) => d.student_id === studentId)?.done_at ?? null,
    sheetPath: a.sheet_path ?? null, sheetName: a.sheet_name ?? "", examplePath: a.example_path ?? null, recording: a.recording === true,
    recordings: ((a.recordings ?? []) as Array<Record<string, any>>).filter((r) => r.student_id === studentId).map(rowToRecording)
      .sort((p: TaskRecording, q: TaskRecording) => p.submittedAt.localeCompare(q.submittedAt)),
    week: weekOf(spans, lessonId) || 1, weeks: spans,
  };
};
```

  `rowToRecording` blijft, met `taskId: r.assignment_id`.

- [ ] **Step 4: De overige `homework`-methodes in `supabase.ts`.**

```ts
async give(studentIds, which, input, tasks, carry = {}) {
  for (const sid of studentIds) {
    const { data: gid, error: e1 } = await sb.rpc("ensure_group", { p_student: sid });
    if (e1) throw e1;
    const { error } = await sb.rpc("give_homework", { p_group: gid, p_which: which, p_notes: input.notes, p_minutes: input.minutesPerDay,
      p_days: input.daysPerWeek, p_remark: input.remark, p_tasks: tasks.map(taskToJson), p_carry: carry[sid] ?? [] });
    if (error) throw error;
  }
  return studentIds.length;
},
async update(lessonId, input, tasks) {
  const { error } = await sb.rpc("update_lesson", { p_lesson: lessonId, p_notes: input.notes, p_minutes: input.minutesPerDay, p_days: input.daysPerWeek,
    p_remark: input.remark, p_date: input.startDate, p_tasks: tasks.map(taskToJson) });
  if (error) throw error;
},
async end(lessonId) { const { error } = await sb.rpc("end_lesson", { p_lesson: lessonId }); if (error) throw error; },
async setTaskDone(homeworkItemId, studentId, done) {
  const { error } = await sb.rpc("set_done", { p_homework: homeworkItemId, p_student: studentId, p_done: done }); if (error) throw error;
},
async submitRecording(assignmentId, studentId, path, seconds) {
  const { error } = await sb.rpc("submit_recording", { p_assignment: assignmentId, p_student: studentId, p_path: path, p_seconds: Math.round(seconds) });
  if (error) throw error;
},
async setSchedule(studentId, weekday) {
  const { data: gid, error: e1 } = await sb.rpc("ensure_group", { p_student: studentId }); if (e1) throw e1;
  const { error } = await sb.rpc("set_schedule", { p_group: gid, p_weekday: weekday }); if (error) throw error;
},
```

  Verwijder `give(input)`, `giveMany`, `giveWithTasks` en `giveForLesson`. Verwijder ook `lessonWeekday` uit `Student`, `rowToStudent` en `students.update`. In de UI komt de lesdag uit de groep: `Homework` krijgt het veld niet. HuiswerkGeven leest de lesdag via `client.homework.schedule(studentId): Promise<number | null>`. Implementatie: `ensure_group` aanroepen, daarna `select weekday from schedule_rules where group_id = … and valid_until is null`.

- [ ] **Step 5: `local.ts`.** Zelfde vorm, met één thuis-groep per leerling.
  - `give` voegt toe aan of maakt de les van die datum, met `lessonPeriod`-achtige data uit `lessons.ts`: deze les = vandaag, volgende = +7.
  - `update`, `end`, `setTaskDone(homeworkItemId, …)` en `setSchedule` werken op `state.homework`.
  - Taken krijgen `homeworkItemId = id`, `week: 1` en `weeks: []`.
  - Meegaan (`carry`) kopieert de taak met hetzelfde id naar de nieuwe les.

- [ ] **Step 6:** Run `pnpm --filter @notenkraker/client test && pnpm --filter @notenkraker/client typecheck`. Expected: PASS.

- [ ] **Step 7: Commit** ("client: huiswerk uit lesgroepen en lessen").

### Task 5: Web: de schermen op het nieuwe model

**Files:**
- Modify:
  - `apps/web/src/screens/HuiswerkGeven.tsx`
  - `apps/web/src/components/Opdrachten.tsx` (`OpdrachtenLijst.tick`)
  - `apps/web/src/screens/Vandaag.tsx` (`tick`)
  - `apps/web/src/screens/Taak.tsx` (`Afvinken`, `Recorder.send`)
  - `apps/web/src/components/LeerlingenTabel.tsx` (`repeat`)
  - `apps/web/src/screens/KindPagina.tsx`
  - `apps/web/src/lib/vandaag.test.ts` (fixture-velden)

**Interfaces:**
- Consumes: `client.homework.*` uit Task 4.

- [ ] **Step 1: De aanroepen omzetten.** TypeScript laat zien waar. Run `pnpm --filter @notenkraker/web typecheck`; Expected: fouten op elke oude aanroep. Zet ze zo om:

```ts
// Vandaag.tsx: tick
try { await client.homework.setTaskDone(t.homeworkItemId, student.id, next); } catch { setTicked((d) => ({ ...d, [t.id]: !next })); }
// Opdrachten.tsx: OpdrachtenLijst krijgt prop studentId?: string; tick:
try { await client.homework.setTaskDone(t.homeworkItemId, studentId!, next); } catch { … }
// Taak.tsx: Afvinken krijgt studentId; Recorder.send:
await client.homework.submitRecording(task.id, studentId, path, seconds);
// HuiswerkGeven.tsx: opslaan
if (editing) await client.homework.update(editing.id, { ...input, startDate: start }, withBank.map(toInput));
else await client.homework.give(studentIds, lesson, input, withBank.map(toInput), carry);
// lesdag
client.homework.setSchedule(studentId, v)   // in plaats van students.update({ lessonWeekday })
// LeerlingenTabel.repeat: volgende les met alle opdrachten van mijn lopende les mee
const prev = currentHomework(r.homeworkAll).find((h) => h.givenBy === profile?.id);
await client.homework.give([id], "volgende", { notes: prev.notes, minutesPerDay: prev.minutesPerDay, daysPerWeek: prev.daysPerWeek, remark: prev.remark }, [], { [id]: prev.tasks.map((t) => t.id) });
```

  In `HuiswerkGeven` komt de lesdag uit `client.homework.schedule(studentId)` (state `weekday`), in plaats van `student.lessonWeekday`. `lessonPeriod(weekday, …)` blijft voor de weergave. Bij "Stoppen" roept de app `client.homework.end(editing.id)` aan; dat zegt de les af.

- [ ] **Step 2:** Run `pnpm -r typecheck && pnpm -r test`. Expected: PASS.

- [ ] **Step 3: E2E.** Run `npx -y supabase@2.120.0 db reset --local` en dan `pnpm e2e`. Expected: alle bestaande specs PASS. Een test die `admin.from("homework_tasks")` gebruikt (zoals `meerdere-opnames.spec.ts`), zet je om naar `assignments`, `recordings` met `student_id`, en `group_members`.

- [ ] **Step 4: Commit** ("web: schermen op lesgroepen en lessen").

### Task 6: Meegaan, "2e week" en opnames per week

**Files:**
- Modify: `apps/web/src/screens/HuiswerkGeven.tsx` (blok "Loopt nog")
- Modify: `apps/web/src/screens/Vandaag.tsx` (`Row`: label), `apps/web/src/components/Huiswerk.tsx` (`HuiswerkKaart`: label en voortgang), `apps/web/src/components/Opdrachten.tsx` (`OpnameLijst`: per week), `apps/web/src/screens/Taak.tsx` (label en per week)
- Create: `apps/e2e/tests/opdracht-meenemen.spec.ts`

**Interfaces:**
- Consumes: `HomeworkTask.week`, `HomeworkTask.weeks`, `recordingsPerWeek`, en `homework.give(…, carry)`.

- [ ] **Step 1: Schrijf de failing e2e `opdracht-meenemen.spec.ts`.**

```ts
import { expect, inloggen, kiesInMenu, test } from "../fixtures";

test("een stuk gaat mee naar de volgende les, met de opname van vorige week", async ({ page, admin, maakGebruiker, maakKind }) => {
  const ouder = await maakGebruiker("ouder", "Papa");
  const kind = await maakKind(ouder, "Noor");
  await admin.from("students").update({ age_band: "9-12", onboarded_at: new Date().toISOString(), recording_consent: true }).eq("id", kind);
  await inloggen(page, ouder);
  await page.getByRole("button", { name: "Noor: details" }).click();
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Lang zal ze leven");
  await page.getByRole("checkbox", { name: /neemt het op/ }).check();
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Noor sturen/ }).click();
  // een opname deze week
  const { data: a } = await admin.from("assignments").select("id, group_id").eq("title", "Lang zal ze leven").single();
  await admin.storage.from("opnames").upload(`${kind}/${a!.id}/1.webm`, new Blob(["x"], { type: "audio/webm" }));
  await admin.from("recordings").insert({ assignment_id: a!.id, student_id: kind, path: `${kind}/${a!.id}/1.webm`, submitted_at: new Date().toISOString() });
  // volgende les: gaat mee
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("group", { name: "Les" }).getByRole("button", { name: /^Volgende les/ }).click();
  const looptNog = page.getByRole("region", { name: "Loopt nog" });
  await looptNog.getByRole("checkbox", { name: /Lang zal ze leven/ }).check();
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Noor sturen/ }).click();
  await expect(page.getByText("Volgende les")).toBeVisible();
  // tijdreis: de volgende les begint vandaag, de vorige was een week geleden
  const vandaag = new Date().toISOString().slice(0, 10);
  const weekTerug = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  await admin.from("lessons").update({ date: weekTerug }).eq("group_id", a!.group_id).lte("date", vandaag);
  await admin.from("lessons").update({ date: vandaag }).eq("group_id", a!.group_id).gt("date", vandaag);
  await admin.from("recordings").update({ submitted_at: new Date(Date.now() - 6 * 864e5).toISOString() }).eq("assignment_id", a!.id);
  await kiesInMenu(page, "Zelf oefenen");
  await expect(page.getByText("2e week")).toBeVisible();
  await page.getByRole("button", { name: /Lang zal ze leven opnemen/ }).click();
  await expect(page.getByText(/Vorige week/)).toBeVisible();
  await expect(page.getByRole("list", { name: "Opnames" }).getByRole("listitem")).toHaveCount(1);
});
```

  Run `pnpm --filter @notenkraker/e2e exec playwright test tests/opdracht-meenemen.spec.ts`. Expected: FAIL (geen "Loopt nog").

- [ ] **Step 2: Het blok "Loopt nog" in `HuiswerkGeven`.** Alleen bij `lesson === "volgende"`, een leerling en niet bij aanpassen.

```tsx
const lopend = list.find((h) => h.givenBy === profile?.id && h.status !== "afgezegd" && h.startDate <= today && h.dueDate >= today);
const [carry, setCarry] = useState<string[]>([]);
const looptNog = !editing && studentId && lesson === "volgende" && lopend && lopend.tasks.length > 0 && (
  <section aria-label="Loopt nog" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
    <div className="flex items-center gap-2"><Caption>Loopt nog · gaat mee naar de volgende les?</Caption>
      <button type="button" onClick={() => setCarry(lopend.tasks.map((t) => t.id))} className="ml-auto text-sm font-semibold text-kent bg-transparent cursor-pointer p-0">alles mee</button></div>
    {lopend.tasks.map((t) => {
      const on = carry.includes(t.id);
      const wat = [t.recordings.length ? `🎙️ ${t.recordings.length} ${t.recordings.length === 1 ? "opname" : "opnames"}` : "", t.doneAt ? "deze les afgevinkt ✓" : ""].filter(Boolean).join(" · ");
      return (
        <label key={t.id} className={clsx("flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer", on ? "border-ok bg-ok/10" : "border-line")}>
          <input type="checkbox" checked={on} onChange={() => setCarry((c) => (on ? c.filter((x) => x !== t.id) : [...c, t.id]))} className="w-5 h-5 accent-[var(--color-ok)]" aria-label={`${t.title} gaat mee`} />
          <span className="flex-1 min-w-0"><b>{t.title}</b>{on && <span className="ml-2 text-xs font-semibold text-accent">wordt {t.week + 1}e week</span>}
            {wat && <span className="block text-sm text-muted">{wat}</span>}</span>
        </label>
      );
    })}
  </section>
);
```

  Zet `{looptNog}` direct onder `{lesKeuze}`, zowel breed als in stap 1. `save` geeft `carry` mee: `{ [studentId]: carry }`. Het overzicht in "Versturen" toont de meegenomen opdrachten met "2e week". De knop is ook actief als er alleen iets mee gaat.

- [ ] **Step 3: Het label "2e week".** Waar een opdracht getoond wordt (Vandaag `Row`, `HuiswerkKaart` → `OpdrachtenLijst`, `Taak`):

```tsx
{t.week > 1 && <span className="ml-2 rounded-full bg-accent-soft text-accent text-xs font-semibold px-2 py-0.5">{t.week}e week</span>}
```

- [ ] **Step 4: Opnames per week.** `OpnameLijst` krijgt de prop `weeks?: LessonSpan[]`. Met `weeks` groepeert hij via `recordingsPerWeek`. Kop per groep: "Deze week" als `span` de week van vandaag bevat, "Vorige week" voor de week direct ervoor, anders `"Week van " + kort(span.start) + " – " + kort(span.end)`. Daarbij is `kort = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })`, zoals in `HuiswerkGeven`. Zonder `weeks` werkt hij zoals nu.

```tsx
const groups = weeks?.length ? recordingsPerWeek(recordings, weeks) : [{ span: null, recordings }];
```

  De nummering ("Opname 2") blijft per opdracht over alle weken. `Taak.tsx` en `HuiswerkKaart` geven `weeks={t.weeks}` mee.

- [ ] **Step 5: Voortgang voor de docent.** Op de `HuiswerkKaart` met `mine` komt per opdracht een kleine keuze: status ("bezig", "klaar") en een cijferveld. Opslaan gaat via `client.homework.setProgress(assignmentId, studentId, status, grade)`, een nieuwe methode die `set_progress` aanroept. De status lees je mee in `list` via `assignments(…, progress(*))`, gefilterd op de leerling. In de gemaksvorm komt dat in `HomeworkTask.progress: { status: "bezig" | "klaar"; grade: number | null } | null`.

- [ ] **Step 6:** Run `pnpm -r typecheck && pnpm -r test && pnpm e2e`. Expected: PASS, ook `opdracht-meenemen.spec.ts`.

- [ ] **Step 7: Commit** ("Meegaan naar de volgende les, 2e week, opnames per week, voortgang (AC-124)").

### Task 7: Afronden

- [ ] **Step 1:** Run `npx -y supabase@2.120.0 test db`, `pnpm -r typecheck`, `pnpm -r test` en `pnpm e2e`. Expected: alles PASS.
- [ ] **Step 2:** Bekijk het met de hand op de laptop (1440) en de iPhone (390): huiswerk geven met "Loopt nog", en de taakpagina met weken. Dat kan met de lokale client (`VITE_SUPABASE_URL= pnpm dev`) of tegen de lokale Supabase.
- [ ] **Step 3:** Open de PR naar develop. Zet in de beschrijving de waarschuwing: 0014 eerst naar de cloud, en direct na de merge develop → main.
- [ ] **Step 4:** Zet een opmerking in Linear (AC-124).
