# Lesgroepen beheren (AC-124 stap 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een leraar maakt lesgroepen met meer leerlingen, stelt het rooster en vakanties in, zegt lessen af of verzet ze, en geeft groepshuiswerk dat hij per leerling volgt.

**Architecture:** Migratie 0015 breidt het model van 0014 uit (status `gestopt`, afzeggen met reden, verzetten, vakanties, opheffen, lidmaatschapsperiode) en verplaatst het einde van de huiswerkperiode naar de database (`end_date(lessons)`). De client krijgt een `GroupsApi` en een helper `lessonOverview`; de web-app krijgt Leerlingen | Groepen, de groepspagina, Les en Vakanties, en Vandaag groepeert per groep.

**Tech Stack:** Postgres/Supabase (plpgsql, pgTAP), TypeScript (`@notenkraker/client`, vitest), React + Tailwind (apps/web), Playwright WebKit (apps/e2e).

**Spec:** `docs/superpowers/specs/2026-10-13-lesgroepen-beheren-design.md` (mock-up `docs/mockups/Lesgroepen-beheren.html`)

## Global Constraints

- Schrijven in de database alleen via functies (`security definer set search_path = public`), elke functie controleert `is_group_teacher`; fout = `raise exception 'geen toegang'` (of `'ongeldig huiswerk'`, `'ongeldige les'`, `'ongeldige groep'`).
- Tabel- en kolomnamen Engels; teksten en commentaar Nederlands, kort.
- Alles als pagina, geen modals; leesbaar op een staande iPhone (390 breed).
- `button { font: inherit }` in index.css wint van Tailwind-tekstklassen op een knop: tekstgrootte op een `<span>` binnen de knop.
- Lokale tests: `npx -y supabase@2.120.0 db reset --local` en `npx -y supabase@2.120.0 test db`; client/web `pnpm test`; typecheck `pnpm -r typecheck`; e2e `pnpm e2e`.
- Commits eindigen met:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Kpmeentmnc4yGSvosDRxfk
  ```
- Migratie naar de cloud doet Alwin zelf; release daarna meteen (0.3.0, develop 0.3.1).

## Review Focus

1. **Afzeggen van een les die al huiswerk heeft terwijl de eerstvolgende les ook al huiswerk heeft** — beide opdrachtenlijsten samen in de volgende les, zonder dubbele regel en zonder dat noten/minuten van die les overschreven worden. Test in Task 3.
2. **Verzetten naar een dag waar al een les is, of naar het verleden** — fout `ongeldige les`, niets verandert. Test in Task 3.
3. **Een lid dat midden in een les-periode instapt** ziet de lopende les (periode raakt zijn lidmaatschap), een lid dat vertrekt ziet nieuw huiswerk niet maar oud wel. Test in Task 1.
4. **Een groep "Samenspel" die krimpt tot één leerling** wordt niet door `ensure_group` als privéles gebruikt. Test in Task 1.
5. **Vandaag met een thuis-groep van de ouder én twee lesgroepen** — dagdoel = max(ouder) vs som(lessen), kopjes per les. Test in Task 5.

---

### Task 1: Migratie 0015 — model, periodes en zichtbaarheid

**Files:**
- Create: `supabase/migrations/0015_lesgroepen_beheren.sql`
- Create: `supabase/tests/lesgroepen-beheren.test.sql`
- Modify: `supabase/tests/lesgroepen-functies.test.sql` (de twee regels met `status <> 'afgezegd'` en de omschrijving bij `end_lesson`)

**Interfaces:**
- Produces (SQL): kolommen `lesson_groups.ended_on date`, `lessons.reason text`, `lessons.original_date date`; status `gestopt`; tabel `holidays(id, teacher_id, name, start_date, end_date)`; functies `in_holiday(p_group uuid, p_day date) returns boolean`, `next_lesson_day(p_group uuid, p_after date) returns date`, `lesson_end(p_lesson uuid) returns date` (herschreven), `end_date(public.lessons) returns date`, `member_during(p_group uuid, p_student uuid, p_lesson uuid) returns boolean`; `lesson_visible`, `member_of_lesson`, `ensure_group`, `end_lesson` aangepast.

- [ ] **Step 1: Schrijf de falende test**

`supabase/tests/lesgroepen-beheren.test.sql` (dit bestand groeit in Task 2 en 3; het `plan(n)` gaat dan omhoog):

```sql
-- Lesgroepen beheren (0015, AC-124 stap 2): periodes, vakanties, zichtbaarheid per lidmaatschap.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from auth.users;
create function pg_temp.als(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create temp table ids (naam text primary key, id uuid);
create function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where naam = n $$;
grant all on ids to authenticated;
grant execute on all functions in schema pg_temp to authenticated;
insert into ids values ('marieke', gen_random_uuid()), ('olaf', gen_random_uuid()), ('noor_user', gen_random_uuid()), ('sem_user', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  (pg_temp.id('marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  (pg_temp.id('olaf'), 'olaf@x.nl', '{"role":"ouder","display_name":"Olaf"}', 'authenticated', 'authenticated'),
  (pg_temp.id('noor_user'), 'noor@x.nl', '{"display_name":"Noor"}', 'authenticated', 'authenticated'),
  (pg_temp.id('sem_user'), 'sem@x.nl', '{"display_name":"Sem"}', 'authenticated', 'authenticated');
reset role;
update profiles set role = 'leraar' where id = pg_temp.id('marieke');
update profiles set role = 'leerling' where id in (pg_temp.id('noor_user'), pg_temp.id('sem_user'));
insert into students (name, owner_id, user_id) values ('Noor', pg_temp.id('olaf'), pg_temp.id('noor_user')), ('Sem', pg_temp.id('olaf'), pg_temp.id('sem_user'));
insert into ids select lower(name), id from students where name in ('Noor', 'Sem');
insert into teacher_students values (pg_temp.id('marieke'), pg_temp.id('noor')), (pg_temp.id('marieke'), pg_temp.id('sem'));

-- ── Model ────────────────────────────────────────────────────────────
select has_table('public', 'holidays', 'vakanties');
select has_column('public', 'lessons', 'original_date', 'verzette les onthoudt zijn roosterdag');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'lessons_status_check')) like '%gestopt%', 'status gestopt bestaat');

-- ── Periodes: rooster, vakantie, afgezegd ────────────────────────────
-- een groep met rooster op de weekdag van vandaag (handmatig; create_group komt in Task 2)
insert into lesson_groups (id, teacher_id, teacher_name, kind, name) values (gen_random_uuid(), pg_temp.id('marieke'), 'Marieke', 'les', 'Samenspel');
insert into ids select 'groep', id from lesson_groups where name = 'Samenspel';
insert into group_members (group_id, student_id, joined_on) values (pg_temp.id('groep'), pg_temp.id('noor'), current_date - 30);
insert into schedule_rules (group_id, weekday, valid_from) values (pg_temp.id('groep'), extract(dow from current_date)::smallint, current_date - 30);
select is(next_lesson_day(pg_temp.id('groep'), current_date), current_date + 7, 'Volgende lesdag: over een week');
insert into holidays (teacher_id, name, start_date, end_date) values (pg_temp.id('marieke'), 'Herfst', current_date + 5, current_date + 9);
select is(next_lesson_day(pg_temp.id('groep'), current_date), current_date + 14, 'Een vakantie wordt overgeslagen');
insert into lessons (group_id, date, status) values (pg_temp.id('groep'), current_date, 'gegeven');
insert into ids select 'les1', id from lessons where group_id = pg_temp.id('groep') and date = current_date;
select is(lesson_end(pg_temp.id('les1')), current_date + 13, 'Het huiswerk loopt door tot de les na de vakantie');
insert into lessons (group_id, date, status, reason) values (pg_temp.id('groep'), current_date + 14, 'afgezegd', 'ziek');
select is(lesson_end(pg_temp.id('les1')), current_date + 20, 'Een afgezegde les telt niet: door tot de les erna');
select is((select end_date(l) from lessons l where id = pg_temp.id('les1')), current_date + 20, 'end_date is dezelfde berekening, als kolom');
-- stoppen: de les zelf telt niet meer, maar het vorige huiswerk gaat ook niet weer lopen
insert into lessons (group_id, date, status) values (pg_temp.id('groep'), current_date - 7, 'gegeven');
insert into ids select 'les0', id from lessons where group_id = pg_temp.id('groep') and date = current_date - 7;
select pg_temp.als(pg_temp.id('marieke'));
select end_lesson(pg_temp.id('les1'));
select is(lesson_end(pg_temp.id('les0')), current_date - 1, 'Na stoppen loopt het vorige huiswerk niet weer door');
select is((select status from lessons where id = pg_temp.id('les1')), 'gestopt', 'Stoppen zet de status gestopt');

-- ── Zichtbaarheid per lidmaatschap ───────────────────────────────────
reset role;
update lessons set status = 'gegeven' where id = pg_temp.id('les1');
insert into group_members (group_id, student_id, joined_on) values (pg_temp.id('groep'), pg_temp.id('sem'), current_date);
select pg_temp.als(pg_temp.id('sem_user'));
select results_eq($$ select date from lessons order by date $$, $$ values (current_date) $$, 'Een nieuw lid ziet de lopende les, niet de oudere');
reset role;
update group_members set left_on = current_date where student_id = pg_temp.id('sem');
insert into lessons (group_id, date, status) values (pg_temp.id('groep'), current_date - 1, 'gegeven');
select pg_temp.als(pg_temp.id('sem_user'));
select results_eq($$ select date from lessons order by date $$, $$ values (current_date) $$, 'Een vertrokken lid ziet zijn oude les nog, maar geen nieuwe');

-- ── Privégroep blijft privé ──────────────────────────────────────────
reset role;
delete from group_members where student_id = pg_temp.id('sem');
select pg_temp.als(pg_temp.id('marieke'));
select isnt(ensure_group(pg_temp.id('noor')), pg_temp.id('groep'), 'Samenspel met alleen Noor is geen privéles');

-- ── Hulpfuncties niet voor anon ──────────────────────────────────────
select ok(not has_function_privilege('anon', 'public.next_lesson_day(uuid, date)', 'execute'), 'anon mag next_lesson_day niet');

select * from finish();
rollback;
```

Let op de test "Een vertrokken lid ziet zijn oude les nog": de les van gisteren (`current_date - 1`) valt vóór zijn `joined_on` (vandaag) en is dus ook al onzichtbaar; de les van vandaag ziet hij omdat `left_on` (vandaag) niet vóór de lesdatum ligt.

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx -y supabase@2.120.0 db reset --local >/dev/null && npx -y supabase@2.120.0 test db 2>&1 | tail -20`
Expected: FAIL in `lesgroepen-beheren.test.sql` (`holidays` bestaat niet).

- [ ] **Step 3: Schrijf de migratie**

`supabase/migrations/0015_lesgroepen_beheren.sql`:

```sql
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

-- ── Privégroep: alleen een groep zonder naam ─────────────────────────
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
```

`lesson_for` uit 0014 filtert op `status <> 'afgezegd'`; dat wordt in Task 2 herschreven. Tot dan: pas in 0015 niets aan `lesson_for` aan.

- [ ] **Step 4: Pas de tests van stap 1 aan de nieuwe status aan**

In `supabase/tests/lesgroepen-functies.test.sql`: vervang in de twee regels van "Review: stoppen en dezelfde dag opnieuw geven" `l.status <> 'afgezegd'` door `l.status not in ('afgezegd','gestopt')` en `status <> 'afgezegd'` door `status not in ('afgezegd','gestopt')`; vervang de omschrijving `'Een afgezegde les telt niet als deze les'` door `'Een gestopte les telt niet als deze les'`.

- [ ] **Step 5: Draai de tests**

Run: `npx -y supabase@2.120.0 db reset --local >/dev/null && npx -y supabase@2.120.0 test db 2>&1 | tail -20`
Expected: `lesgroepen-beheren.test.sql` 14/14 ok. `lesgroepen-functies.test.sql` kan nog falen op `lesson_for` (die kijkt alleen naar `afgezegd`): noteer welke tests; ze worden in Task 2 groen. Alle andere bestanden PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0015_lesgroepen_beheren.sql supabase/tests/lesgroepen-beheren.test.sql supabase/tests/lesgroepen-functies.test.sql
git commit -m "0015: vakanties, gestopt naast afgezegd, einde per database, lid in een periode (AC-124 stap 2)"
```

---

### Task 2: Groepen maken en beheren, rooster met tijd, lesson_for

**Files:**
- Modify: `supabase/migrations/0015_lesgroepen_beheren.sql` (onderaan toevoegen)
- Modify: `supabase/tests/lesgroepen-beheren.test.sql`

**Interfaces:**
- Consumes: `next_lesson_day`, `in_holiday` (Task 1).
- Produces (SQL): `create_group(p_name text, p_students uuid[], p_weekday smallint, p_start_time time) returns uuid`, `rename_group(p_group uuid, p_name text)`, `add_member(p_group uuid, p_student uuid)`, `remove_member(p_group uuid, p_student uuid)`, `end_group(p_group uuid)`, `set_schedule(p_group uuid, p_weekday smallint, p_start_time time)` (vervangt de versie met twee parameters), `lesson_for(p_group uuid, p_which text)` herschreven.

- [ ] **Step 1: Schrijf de falende tests**

Zet in `lesgroepen-beheren.test.sql` vóór `select * from finish();`, en verhoog `plan(14)` naar `plan(27)`:

```sql
-- ── Groepen maken en beheren ─────────────────────────────────────────
reset role;
delete from lessons; delete from holidays; delete from schedule_rules;
insert into ids values ('vreemd_kind', gen_random_uuid());
insert into students (id, name, owner_id) values (pg_temp.id('vreemd_kind'), 'Vreemd', pg_temp.id('olaf'));
select pg_temp.als(pg_temp.id('marieke'));
insert into ids select 'trio', create_group('Trio', array[pg_temp.id('noor'), pg_temp.id('sem')], extract(dow from current_date)::smallint, '10:00');
select is((select count(*)::int from group_members where group_id = pg_temp.id('trio') and left_on is null), 2, 'Groep met twee leerlingen');
select is((select start_time from schedule_rules where group_id = pg_temp.id('trio')), '10:00'::time, 'Rooster met begintijd');
select throws_ok($$ select create_group('Fout', array[pg_temp.id('vreemd_kind')], null, null) $$, 'P0001', 'geen toegang', 'Alleen eigen leerlingen');
select throws_ok($$ select create_group('  ', array[pg_temp.id('noor')], null, null) $$, 'P0001', 'ongeldige groep', 'Een groep heeft een naam');
select lives_ok($$ select rename_group(pg_temp.id('trio'), 'Duo') $$, 'Hernoemen');
select is((lesson_for(pg_temp.id('trio'), 'volgende')).start_time, '10:00'::time, 'Een nieuwe les krijgt de begintijd van het rooster');
select is((lesson_for(pg_temp.id('trio'), 'volgende')).date, current_date + 7, 'De volgende les op de volgende lesdag');
-- lid eruit en er weer in
select lives_ok($$ select remove_member(pg_temp.id('trio'), pg_temp.id('sem')) $$, 'Sem eruit');
select is((select left_on from group_members where group_id = pg_temp.id('trio') and student_id = pg_temp.id('sem')), current_date, 'Vertrokken vanaf vandaag');
select lives_ok($$ select add_member(pg_temp.id('trio'), pg_temp.id('sem')) $$, 'Sem weer erin');
select is((select left_on from group_members where group_id = pg_temp.id('trio') and student_id = pg_temp.id('sem')), null, 'Weer lid');
-- opheffen
select lives_ok($$ select end_group(pg_temp.id('trio')) $$, 'Opheffen');
select throws_ok($$ select lesson_for(pg_temp.id('trio'), 'volgende') $$, 'P0001', 'ongeldige groep', 'Een opgeheven groep krijgt geen lessen meer');
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx -y supabase@2.120.0 db reset --local >/dev/null && npx -y supabase@2.120.0 test db 2>&1 | tail -20`
Expected: FAIL (`function create_group(...) does not exist`).

- [ ] **Step 3: Schrijf de functies**

Onderaan `0015_lesgroepen_beheren.sql`:

```sql
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
```

- [ ] **Step 4: Draai de tests**

Run: `npx -y supabase@2.120.0 db reset --local >/dev/null && npx -y supabase@2.120.0 test db 2>&1 | tail -20`
Expected: alle bestanden PASS, ook `lesgroepen-functies.test.sql` (de `set_schedule`-aanroep daar heeft twee parameters: pas `set_schedule(pg_temp.id('groep'), extract(dow from current_date - 2)::smallint)` aan naar `set_schedule(pg_temp.id('groep'), extract(dow from current_date - 2)::smallint, null)` en draai opnieuw).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_lesgroepen_beheren.sql supabase/tests/
git commit -m "0015: groepen maken, leden, opheffen, rooster met tijd (AC-124 stap 2)"
```

---

### Task 3: Lessen afzeggen en verzetten, vakanties, controles

**Files:**
- Modify: `supabase/migrations/0015_lesgroepen_beheren.sql` (onderaan)
- Modify: `supabase/tests/lesgroepen-beheren.test.sql`

**Interfaces:**
- Consumes: `lesson_for`, `next_lesson_day`, `scheduled_time` (Task 1–2).
- Produces (SQL): `cancel_lesson(p_group uuid, p_date date, p_reason text)`, `move_lesson(p_group uuid, p_date date, p_new_date date, p_start_time time)`, `add_holiday(p_name text, p_from date, p_to date) returns uuid`, `remove_holiday(p_id uuid)`, `check_notes(p_notes jsonb)`; `give_homework`, `update_lesson`, `set_progress` met extra controles.

- [ ] **Step 1: Schrijf de falende tests**

Vóór `finish()`, en `plan(27)` → `plan(44)`:

```sql
-- ── Afzeggen, verzetten, vakanties ───────────────────────────────────
reset role;
delete from lessons; delete from schedule_rules;
select pg_temp.als(pg_temp.id('marieke'));
insert into ids select 'band', create_group('Band', array[pg_temp.id('noor')], extract(dow from current_date)::smallint, '16:00');
select give_homework(pg_temp.id('band'), 'deze', '[]', 15, 5, '', jsonb_build_array(jsonb_build_object('kind', 'opdracht', 'title', 'Deze week')), '{}');
select give_homework(pg_temp.id('band'), 'volgende', '["c5"]', 20, 4, 'Klaargezet', jsonb_build_array(jsonb_build_object('kind', 'opdracht', 'title', 'Klaargezet')), '{}');
-- de les over een week afzeggen: het klaargezette huiswerk schuift naar de les erna
select lives_ok($$ select cancel_lesson(pg_temp.id('band'), current_date + 7, 'leraar ziek') $$, 'Les afzeggen');
select is((select status || ' ' || reason from lessons where group_id = pg_temp.id('band') and date = current_date + 7), 'afgezegd leraar ziek', 'Afgezegd met reden');
select results_eq($$ select l.date, a.title from homework h join lessons l on l.id = h.lesson_id join assignments a on a.id = h.assignment_id
  where l.group_id = pg_temp.id('band') and a.title = 'Klaargezet' $$, $$ values (current_date + 14, 'Klaargezet'::text) $$, 'Klaargezet huiswerk schuift naar de les erna');
select is((select minutes_per_day || ' ' || remark from lessons where group_id = pg_temp.id('band') and date = current_date + 14), '20 Klaargezet', 'met het doel en de opmerking');
select is(lesson_end((select id from lessons where group_id = pg_temp.id('band') and date = current_date)), current_date + 13, 'Het huiswerk van deze week loopt door tot de les erna');
-- afzeggen terwijl de les erna al huiswerk heeft: samenvoegen, niets dubbel, doel van die les blijft
select give_homework(pg_temp.id('band'), 'volgende', '[]', 30, 3, 'Na', jsonb_build_array(jsonb_build_object('kind', 'opdracht', 'title', 'Na')), '{}');
select lives_ok($$ select cancel_lesson(pg_temp.id('band'), current_date + 14, '') $$, 'Ook die les afzeggen');
select is((select count(*)::int from homework h join lessons l on l.id = h.lesson_id where l.group_id = pg_temp.id('band') and l.date = current_date + 21), 2, 'Beide opdrachten in de les daarna');
select throws_ok($$ select cancel_lesson(pg_temp.id('band'), current_date - 7, '') $$, 'P0001', 'ongeldige les', 'Een les in het verleden zeg je niet af');
-- verzetten
select lives_ok($$ select move_lesson(pg_temp.id('band'), current_date + 21, current_date + 20, '15:00') $$, 'Verzetten naar een dag eerder');
select is((select date || ' ' || start_time || ' ' || original_date from lessons where group_id = pg_temp.id('band') and original_date is not null),
  (current_date + 20) || ' 15:00:00 ' || (current_date + 21), 'Nieuwe dag en tijd, de roosterdag onthouden');
select is(next_lesson_day(pg_temp.id('band'), current_date + 14), current_date + 28, 'De verzette roosterdag komt niet terug');
select throws_ok($$ select move_lesson(pg_temp.id('band'), current_date + 20, current_date, null) $$, 'P0001', 'ongeldige les', 'Niet naar een dag met een les');
select throws_ok($$ select move_lesson(pg_temp.id('band'), current_date + 20, current_date - 1, null) $$, 'P0001', 'ongeldige les', 'Niet naar het verleden');
-- vakanties
insert into ids select 'vak', add_holiday('Kerst', current_date + 25, current_date + 30);
select is(next_lesson_day(pg_temp.id('band'), current_date + 21), current_date + 35, 'Vakantie overgeslagen');
select lives_ok($$ select remove_holiday(pg_temp.id('vak')) $$, 'Vakantie weg');
-- ── Controles ────────────────────────────────────────────────────────
select throws_ok($$ select give_homework(pg_temp.id('band'), 'deze', '[1, 2]', 15, 5, '', '[]', '{}') $$, 'P0001', 'ongeldig huiswerk', 'Noten zijn tekst');
select throws_ok($$ select set_progress((select id from assignments where title = 'Na'), pg_temp.id('vreemd_kind'), 'klaar', null) $$, 'P0001', 'geen toegang', 'Voortgang alleen voor een lid');
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `npx -y supabase@2.120.0 db reset --local >/dev/null && npx -y supabase@2.120.0 test db 2>&1 | tail -20`
Expected: FAIL (`function cancel_lesson(...) does not exist`).

- [ ] **Step 3: Schrijf de functies**

Onderaan `0015_lesgroepen_beheren.sql`:

```sql
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
  elsif not exists (select 1 from public.homework where lesson_id = nxt.id) then
    update public.lessons set notes = l.notes, minutes_per_day = l.minutes_per_day, days_per_week = l.days_per_week, remark = l.remark where id = nxt.id;
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
```

Herschrijf daarna `give_homework` (zelfde signatuur als 0014) met als eerste regel van de body `perform public.check_notes(p_notes);` vóór de bestaande controle; en `update_lesson` met `perform public.check_notes(p_notes);` en een extra controle na de bestaande:

```sql
  if exists (select 1 from public.lessons where group_id = l.group_id and date = p_date and id <> p_lesson) then raise exception 'ongeldig huiswerk'; end if;
```

Kopieer daarvoor beide functies volledig uit `0014_lesgroepen.sql` (`give_homework` regels 330–347, `update_lesson` regels 348–390) naar 0015 als `create or replace function`, en voeg alleen deze regels toe. `set_progress` wordt:

```sql
create or replace function public.set_progress(p_assignment uuid, p_student uuid, p_status text, p_grade numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.assignments a join public.group_members m on m.group_id = a.group_id and m.student_id = p_student
                 where a.id = p_assignment and public.is_group_teacher(a.group_id)) then raise exception 'geen toegang'; end if;
  if p_status not in ('bezig','klaar') or (p_grade is not null and p_grade not between 1 and 10) then raise exception 'ongeldige voortgang'; end if;
  insert into public.progress (assignment_id, student_id, status, grade) values (p_assignment, p_student, p_status, p_grade)
  on conflict (assignment_id, student_id) do update set status = excluded.status, grade = excluded.grade, updated_at = now();
end $$;
```

- [ ] **Step 4: Draai de tests**

Run: `npx -y supabase@2.120.0 db reset --local >/dev/null && npx -y supabase@2.120.0 test db 2>&1 | tail -20`
Expected: alle bestanden PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0015_lesgroepen_beheren.sql supabase/tests/lesgroepen-beheren.test.sql
git commit -m "0015: lessen afzeggen en verzetten, vakanties, controles op noten, datum en voortgang (AC-124 stap 2)"
```

---

### Task 4: Client — types, GroupsApi, lessonOverview, status gestopt

**Files:**
- Modify: `packages/client/src/types.ts`
- Modify: `packages/client/src/lessons.ts`, `packages/client/src/lessons.test.ts` (bestaat; anders aanmaken)
- Modify: `packages/client/src/homework.ts`, `packages/client/src/homework.test.ts`
- Modify: `packages/client/src/supabase.ts`, `packages/client/src/local.ts`, `packages/client/src/index.ts`
- Modify: `apps/web/src/screens/HuiswerkGeven.tsx:90,93`, `apps/web/src/components/LeerlingenTabel.tsx:51` (`!== "afgezegd"` → `isRunning`)

**Interfaces:**
- Consumes: SQL-functies uit Task 1–3; kolom `end_date`.
- Produces (TS):
  ```ts
  export type LessonStatus = "gepland" | "gegeven" | "afgezegd" | "gestopt";
  export function isRunning(h: { status: LessonStatus }): boolean; // gepland of gegeven
  export interface GroupMember { studentId: string; name: string; joinedOn: string; leftOn: string | null }
  export interface Schedule { weekday: number | null; startTime: string | null } // "16:30"
  export interface Holiday { id: string; name: string; startDate: string; endDate: string }
  export interface GroupLessonItem { homeworkItemId: string; assignmentId: string; title: string; kind: TaskKind; recording: boolean; position: number; week: number; doneBy: string[]; recordingsBy: Record<string, number> }
  export interface GroupLesson { id: string; date: string; startTime: string | null; status: LessonStatus; reason: string; originalDate: string | null; endDate: string; notes: NoteId[]; minutesPerDay: number; daysPerWeek: number; remark: string; items: GroupLessonItem[] }
  export interface LessonGroup { id: string; name: string; displayName: string; kind: "les" | "thuis"; endedOn: string | null; members: GroupMember[]; schedule: Schedule; lessons: GroupLesson[] }
  export type OverviewStatus = "gegeven" | "gepland" | "afgezegd" | "gestopt" | "vakantie";
  export interface OverviewRow { date: string; time: string | null; status: OverviewStatus; lesson: GroupLesson | null; label: string }
  export function lessonOverview(lessons: GroupLesson[], schedule: Schedule, holidays: Holiday[], today: string, weeksAhead?: number): OverviewRow[];
  export function nextLesson(rows: OverviewRow[], today: string): OverviewRow | null; // eerste gepland na vandaag
  export interface GroupsApi {
    mine(): Promise<LessonGroup[]>;                // alleen leraar; opgeheven niet; privé met displayName = naam leerling
    get(groupId: string): Promise<LessonGroup>;    // met lessons[].items
    create(name: string, studentIds: string[], schedule: Schedule): Promise<string>;
    rename(groupId: string, name: string): Promise<void>;
    addMember(groupId: string, studentId: string): Promise<void>;
    removeMember(groupId: string, studentId: string): Promise<void>;
    end(groupId: string): Promise<void>;
    setSchedule(groupId: string, schedule: Schedule): Promise<void>;
    cancelLesson(groupId: string, date: string, reason: string): Promise<void>;
    moveLesson(groupId: string, date: string, newDate: string, time: string | null): Promise<void>;
    holidays(): Promise<Holiday[]>;
    addHoliday(name: string, from: string, to: string): Promise<string>;
    removeHoliday(id: string): Promise<void>;
  }
  // Homework: status: LessonStatus; groupName: string
  // HomeworkApi: giveToGroup(groupId: string, which: Lesson, input: LessonInput, tasks: TaskInput[], carry: string[]): Promise<void>
  // Notenkraker: groups: GroupsApi
  ```

- [ ] **Step 1: Schrijf de falende unit-tests**

In `packages/client/src/lessons.test.ts` (aanmaken als het niet bestaat; importeer `describe, expect, it` uit vitest):

```ts
import { describe, expect, it } from "vitest";
import { lessonOverview, nextLesson } from "./lessons.js";
import type { GroupLesson } from "./types.js";

const les = (date: string, status: GroupLesson["status"] = "gepland", more: Partial<GroupLesson> = {}): GroupLesson => ({
  id: date, date, startTime: null, status, reason: "", originalDate: null, endDate: date, notes: [], minutesPerDay: 15, daysPerWeek: 5, remark: "", items: [], ...more,
});
// za 10 okt 2026 is een zaterdag
describe("lessonOverview", () => {
  const za = { weekday: 6, startTime: "10:00" };
  it("toont echte lessen en de komende roosterdagen, nieuwste eerst", () => {
    const rows = lessonOverview([les("2026-10-10")], za, [], "2026-10-13", 2);
    expect(rows.map((r) => `${r.date} ${r.status}`)).toEqual(["2026-10-24 gepland", "2026-10-17 gepland", "2026-10-10 gegeven"]);
    expect(rows[0]!.time).toBe("10:00");
  });
  it("roosterdagen in een vakantie heten vakantie", () => {
    const rows = lessonOverview([], za, [{ id: "h", name: "Herfst", startDate: "2026-10-17", endDate: "2026-10-25" }], "2026-10-13", 3);
    expect(rows.map((r) => `${r.date} ${r.status} ${r.label}`)).toEqual(["2026-10-31 gepland ", "2026-10-24 vakantie Herfst", "2026-10-17 vakantie Herfst"]);
  });
  it("een verzette les vervangt zijn roosterdag; afgezegd blijft staan met reden", () => {
    const rows = lessonOverview([les("2026-10-16", "gepland", { originalDate: "2026-10-17" }), les("2026-10-24", "afgezegd", { reason: "ziek" })], za, [], "2026-10-13", 2);
    expect(rows.map((r) => `${r.date} ${r.status} ${r.label}`)).toEqual(["2026-10-24 afgezegd ziek", "2026-10-16 gepland verzet van za 17 okt"]);
  });
  it("zonder rooster alleen de echte lessen", () => {
    expect(lessonOverview([les("2026-10-20")], { weekday: null, startTime: null }, [], "2026-10-13").map((r) => r.date)).toEqual(["2026-10-20"]);
  });
});

describe("nextLesson", () => {
  it("de eerste geplande les na vandaag", () => {
    const rows = lessonOverview([les("2026-10-13", "gegeven")], { weekday: 2, startTime: null }, [], "2026-10-13", 2);
    expect(nextLesson(rows, "2026-10-13")?.date).toBe("2026-10-20");
  });
});
```

In `packages/client/src/homework.test.ts`, onder de bestaande test "een afgezegde (gestopte) les telt niet":

```ts
  it("een gestopte les telt ook niet", () => {
    expect(currentHomework([hw({ status: "gestopt" })], now)).toEqual([]);
  });
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Run: `pnpm --filter @notenkraker/client exec vitest run 2>&1 | tail -15`
Expected: FAIL (`lessonOverview` is not exported; type-fout op `"gestopt"`).

- [ ] **Step 3: Implementeer types en helpers**

`types.ts`: voeg de types uit het Interfaces-blok toe; zet in `Homework` `status: LessonStatus` (commentaar: `afgezegd = de les gaat niet door, gestopt = huiswerk gestopt; beide tellen niet als lopende les`) en `groupName: string` (commentaar: `naam van de lesgroep; leeg bij privéles en thuis`); voeg `giveToGroup` toe aan `HomeworkApi` en `groups: GroupsApi` aan `Notenkraker`.

`lessons.ts`, onderaan:

```ts
const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DAYS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const short = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };

export function isRunning(h: { status: LessonStatus }): boolean { return h.status === "gepland" || h.status === "gegeven"; }

/**
 * Het lessenoverzicht van een groep (stap 2): de echte lessen, plus de komende roosterdagen (gepland) en
 * roosterdagen in een vakantie. Een verzette les vervangt zijn roosterdag. Nieuwste eerst.
 */
export function lessonOverview(lessons: GroupLesson[], schedule: Schedule, holidays: Holiday[], today: string, weeksAhead = 8): OverviewRow[] {
  const holidayOn = (d: string) => holidays.find((h) => h.startDate <= d && d <= h.endDate);
  const rows: OverviewRow[] = lessons.map((l) => ({
    date: l.date, time: l.startTime, lesson: l,
    status: l.status === "afgezegd" || l.status === "gestopt" ? l.status : l.date <= today ? "gegeven" : "gepland",
    label: l.status === "afgezegd" ? l.reason : l.originalDate && l.originalDate !== l.date ? `verzet van ${short(l.originalDate)}` : "",
  }));
  if (schedule.weekday !== null) {
    const taken = new Set(lessons.flatMap((l) => [l.date, l.originalDate ?? l.date]));
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + ((schedule.weekday - d.getDay() + 7) % 7 || 7));
    for (let i = 0; i < weeksAhead; i++, d.setDate(d.getDate() + 7)) {
      const iso = dateKey(d);
      if (taken.has(iso)) continue;
      const h = holidayOn(iso);
      rows.push({ date: iso, time: schedule.startTime, lesson: null, status: h ? "vakantie" : "gepland", label: h ? h.name : "" });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** de eerstvolgende les die doorgaat, na vandaag */
export function nextLesson(rows: OverviewRow[], today: string): OverviewRow | null {
  return [...rows].reverse().find((r) => r.status === "gepland" && r.date > today) ?? null;
}
```

Importeer in `lessons.ts`: `import type { GroupLesson, Holiday, LessonSpan, LessonStatus, OverviewRow, Schedule, TaskRecording } from "./types.js";`.

`homework.ts`: vervang in `currentHomework` en `upcomingHomework` `h.status !== "afgezegd"` door `isRunning(h)` (import uit `./lessons.js`).

`index.ts`: voeg `isRunning, lessonOverview, nextLesson` toe aan de export uit `./lessons.js`.

- [ ] **Step 4: Draai de unit-tests**

Run: `pnpm --filter @notenkraker/client exec vitest run 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Implementeer de Supabase-client**

In `supabase.ts`:

1. `rowToTask`: de week-spans filteren op `isRunning`-status in plaats van `x.status !== "afgezegd"` (regel 219: `.filter((x): x is Row => !!x && (x.status === "gepland" || x.status === "gegeven"))`).
2. `homework.list`: select wordt
   `"lesson_groups(id, teacher_id, teacher_name, kind, name, lessons(*, end_date, homework(id, position, homework_done(student_id, done_at), assignments(*, recordings(*), progress(*), homework(lessons(id, date, status))))))"`;
   `dueDate: l.end_date as string`; `groupName: (g.name as string) ?? ""`; de variabele `dates` en de import van `lessonEnd` vervallen als ze niet meer gebruikt worden.
3. `homework.giveToGroup`:
   ```ts
   async giveToGroup(groupId, which, input, tasks, carry) {
     const { error } = await sb.rpc("give_homework", {
       p_group: groupId, p_which: which, p_notes: input.notes, p_minutes: input.minutesPerDay, p_days: input.daysPerWeek,
       p_remark: input.remark, p_tasks: tasks.map(taskToJson), p_carry: carry,
     });
     if (error) throw error;
   },
   ```
4. `homework.setSchedule` roept `set_schedule` aan met `p_start_time: null`.
5. Nieuwe `groups: GroupsApi`:
   ```ts
   const rpc = async (fn: string, args: Record<string, unknown>) => { const { data, error } = await sb.rpc(fn, args); if (error) throw error; return data; };
   const toLesson = (l: Row): GroupLesson => {
     const items = ((l.homework ?? []) as Row[]).filter((h) => h.assignments).map((h) => {
       const a = h.assignments as Row;
       const starts = ((a.homework ?? []) as Row[]).map((x) => x.lessons as Row | null)
         .filter((x): x is Row => !!x && (x.status === "gepland" || x.status === "gegeven")).map((x) => x.date as string).sort();
       const recs = ((a.recordings ?? []) as Row[]).filter((r) => r.path);
       return {
         homeworkItemId: h.id, assignmentId: a.id, title: a.title, kind: a.kind, recording: a.recording === true, position: h.position,
         week: starts.indexOf(l.date as string) + 1 || 1,
         doneBy: ((h.homework_done ?? []) as Row[]).map((d) => d.student_id as string),
         recordingsBy: recs.reduce<Record<string, number>>((m, r) => ({ ...m, [r.student_id as string]: (m[r.student_id as string] ?? 0) + 1 }), {}),
       } satisfies GroupLessonItem;
     }).sort((p, q) => p.position - q.position);
     return {
       id: l.id, date: l.date, startTime: l.start_time ? String(l.start_time).slice(0, 5) : null, status: l.status, reason: l.reason ?? "",
       originalDate: l.original_date ?? null, endDate: l.end_date, notes: l.notes ?? [], minutesPerDay: l.minutes_per_day,
       daysPerWeek: l.days_per_week, remark: l.remark ?? "", items,
     };
   };
   const toGroup = (g: Row): LessonGroup => {
     const members = ((g.group_members ?? []) as Row[]).map((m) => ({
       studentId: m.student_id, name: (m.students as Row | null)?.name ?? "", joinedOn: m.joined_on, leftOn: m.left_on ?? null,
     }));
     const rule = ((g.schedule_rules ?? []) as Row[]).filter((r) => !r.valid_until).sort((p, q) => String(q.valid_from).localeCompare(String(p.valid_from)))[0];
     return {
       id: g.id, name: g.name ?? "", kind: g.kind, endedOn: g.ended_on ?? null, members,
       displayName: g.name || members.find((m) => !m.leftOn)?.name || "",
       schedule: { weekday: rule ? Number(rule.weekday) : null, startTime: rule?.start_time ? String(rule.start_time).slice(0, 5) : null },
       lessons: ((g.lessons ?? []) as Row[]).map(toLesson).sort((p, q) => q.date.localeCompare(p.date)),
     };
   };
   const GROUP_SELECT = "*, group_members(student_id, joined_on, left_on, students(name)), schedule_rules(weekday, start_time, valid_from, valid_until)";
   const groups: GroupsApi = {
     async mine() {
       const { data: me } = await sb.auth.getUser();
       const { data, error } = await sb.from("lesson_groups").select(`${GROUP_SELECT}, lessons(id, date, start_time, status, reason, original_date, end_date, notes, minutes_per_day, days_per_week, remark)`)
         .eq("teacher_id", me.user?.id ?? "").eq("kind", "les").is("ended_on", null);
       if (error) throw error;
       return ((data ?? []) as Row[]).map(toGroup);
     },
     async get(groupId) {
       const { data, error } = await sb.from("lesson_groups").select(`${GROUP_SELECT}, lessons(*, end_date, homework(id, position, homework_done(student_id), assignments(id, title, kind, recording, recordings(student_id, path), homework(lessons(date, status)))))`)
         .eq("id", groupId).single();
       if (error) throw error;
       return toGroup(data as Row);
     },
     async create(name, studentIds, s) { return (await rpc("create_group", { p_name: name, p_students: studentIds, p_weekday: s.weekday, p_start_time: s.startTime })) as string; },
     async rename(groupId, name) { await rpc("rename_group", { p_group: groupId, p_name: name }); },
     async addMember(groupId, studentId) { await rpc("add_member", { p_group: groupId, p_student: studentId }); },
     async removeMember(groupId, studentId) { await rpc("remove_member", { p_group: groupId, p_student: studentId }); },
     async end(groupId) { await rpc("end_group", { p_group: groupId }); },
     async setSchedule(groupId, s) { await rpc("set_schedule", { p_group: groupId, p_weekday: s.weekday, p_start_time: s.startTime }); },
     async cancelLesson(groupId, date, reason) { await rpc("cancel_lesson", { p_group: groupId, p_date: date, p_reason: reason }); },
     async moveLesson(groupId, date, newDate, time) { await rpc("move_lesson", { p_group: groupId, p_date: date, p_new_date: newDate, p_start_time: time }); },
     async holidays() {
       const { data, error } = await sb.from("holidays").select("*").order("start_date");
       if (error) throw error;
       return ((data ?? []) as Row[]).map((h) => ({ id: h.id, name: h.name, startDate: h.start_date, endDate: h.end_date }));
     },
     async addHoliday(name, from, to) { return (await rpc("add_holiday", { p_name: name, p_from: from, p_to: to })) as string; },
     async removeHoliday(id) { await rpc("remove_holiday", { p_id: id }); },
   };
   ```
   en voeg `groups` toe aan het object dat `createSupabaseNotenkraker` teruggeeft.

In `local.ts`: `groupName: ""` bij elk aangemaakt huiswerk, `isRunning` in plaats van `!== "afgezegd"` (regels 109, 123), `giveToGroup` gooit `new Error("geen groepen zonder account")`, en `groups` met `mine: async () => []`, `holidays: async () => []` en elke andere methode `async () => { throw new Error("geen groepen zonder account"); }`.

In de web-app: vervang `h.status !== "afgezegd"` door `isRunning(h)` in `HuiswerkGeven.tsx` (2×) en `LeerlingenTabel.tsx` (1×), met `isRunning` geïmporteerd uit `@notenkraker/client`.

- [ ] **Step 6: Typecheck en alle tests**

Run: `pnpm -r typecheck 2>&1 | grep -E "error TS" ; pnpm test 2>&1 | grep -E "Tests |FAIL"`
Expected: geen `error TS`; alle Tests-regels passed.

- [ ] **Step 7: Commit**

```bash
git add packages/client apps/web/src/screens/HuiswerkGeven.tsx apps/web/src/components/LeerlingenTabel.tsx
git commit -m "Client: groepen, lessenoverzicht, groepshuiswerk, einde uit de database (AC-124 stap 2)"
```

---

### Task 5: Vandaag per groep en het dagdoel

**Files:**
- Modify: `apps/web/src/lib/vandaag.ts`, `apps/web/src/lib/vandaag.test.ts`
- Modify: `apps/web/src/screens/Vandaag.tsx` (render van de nieuwe rij)

**Interfaces:**
- Consumes: `Homework.groupName`, `Homework.givenByRole`, `Homework.dueDate`.
- Produces: `VandaagRow` krijgt `| { kind: "groep"; key: string; title: string; due: string }`; `planVandaag` zet die vóór de taken van elke les als er meer dan één lopende les is. Dagdoel: `goal = max(max(thuis-doelen), som(les-doelen))`.

- [ ] **Step 1: Schrijf de falende tests**

In `vandaag.test.ts` (gebruik de bestaande helper waarmee de tests een `CurrentHomework` maken; heet die anders dan `item`, pas de naam aan):

```ts
describe("planVandaag met meer groepen", () => {
  it("een kopje per les als er meer dan één lopende les is", () => {
    const plan = planVandaag([
      item({ id: "a", groupName: "", givenByRole: "leraar", minutesPerDay: 10, dueDate: "2026-10-19" }),
      item({ id: "b", groupName: "Samenspel zaterdag", givenByRole: "leraar", minutesPerDay: 10, dueDate: "2026-10-30" }),
    ], { mayRecord: true })!;
    expect(plan.rows.filter((r) => r.kind === "groep").map((r) => r.kind === "groep" && r.title)).toEqual(["Privéles", "Samenspel zaterdag"]);
  });
  it("één les: geen kopje", () => {
    const plan = planVandaag([item({ id: "a", groupName: "" })], { mayRecord: true })!;
    expect(plan.rows.some((r) => r.kind === "groep")).toBe(false);
  });
  it("lessen tellen op, de ouder telt als hoogste", () => {
    const plan = planVandaag([
      item({ id: "a", givenByRole: "leraar", minutesPerDay: 10 }),
      item({ id: "b", givenByRole: "leraar", minutesPerDay: 15 }),
      item({ id: "c", givenByRole: "ouder", minutesPerDay: 20 }),
    ], { mayRecord: true })!;
    expect(plan.goal).toBe(25);
  });
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `pnpm --filter web exec vitest run src/lib/vandaag.test.ts 2>&1 | tail -15`
Expected: FAIL (geen rij `groep`; goal 20).

- [ ] **Step 3: Implementeer**

In `vandaag.ts`: voeg de rij-soort toe en vervang de berekening van `goal`:

```ts
  /** kopje boven de taken van een les, als er meer dan één lopende les is (stap 2) */
  | { kind: "groep"; key: string; title: string; due: string };
```

```ts
  // lessen (leraar) tellen op; een ouder geeft een doel voor alles samen: het hoogste telt (stap 2, besluit 8)
  const lesGoal = items.filter((x) => x.h.givenByRole === "leraar").reduce((s, x) => s + x.h.minutesPerDay, 0);
  const homeGoal = Math.max(0, ...items.filter((x) => x.h.givenByRole !== "leraar").map((x) => x.h.minutesPerDay));
  const goal = Math.max(lesGoal, homeGoal);
```

(laat `main` staan voor `doneDays`/`goalDays`), en in de lus over `items`:

```ts
  for (const { h } of items) {
    if (items.length > 1) rows.push({ kind: "groep", key: `${h.id}-kop`, title: h.groupName || (h.givenByRole === "leraar" ? "Privéles" : `Van ${h.givenByName}`), due: h.dueDate });
```

In `Vandaag.tsx`, in de `switch`/conditie die rijen tekent, een tak voor `kind === "groep"`:

```tsx
if (row.kind === "groep") return <h2 key={row.key} className="font-display font-bold text-base mt-3 mb-0">{row.title} <span className="font-normal text-muted text-sm">· {dueLabel(row.due)}</span></h2>;
```

(`dueLabel` uit `@notenkraker/client`; gebruikt Vandaag een andere tekst voor de einddatum, gebruik die.)

- [ ] **Step 4: Draai de tests**

Run: `pnpm --filter web exec vitest run 2>&1 | tail -6 ; pnpm -r typecheck 2>&1 | grep "error TS"`
Expected: PASS, geen typefouten.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vandaag.ts apps/web/src/lib/vandaag.test.ts apps/web/src/screens/Vandaag.tsx
git commit -m "Vandaag: kopje per les bij meer groepen, lessen tellen op in het dagdoel (AC-124 stap 2)"
```

---

### Task 6: Leerlingen | Groepen, Nieuwe groep, Vakanties

**Files:**
- Create: `apps/web/src/screens/Groepen.tsx` (lijst, Nieuwe groep, Vakanties)
- Modify: `apps/web/src/screens/Dashboard.tsx` (schakelaar, alleen leraar)
- Modify: `apps/web/src/AppMetLogin.tsx` (schermen `groep`, `groepnieuw`, `vakanties`, `les`; `NavState.groupId`, `NavState.date`)
- Create: `apps/e2e/tests/groepen.spec.ts` (eerste test)

**Interfaces:**
- Consumes: `client.groups.*`, `lessonOverview`, `nextLesson`.
- Produces: `export function GroepenLijst({ onOpen, onNew, onHolidays }: { onOpen(id: string): void; onNew(): void; onHolidays(): void })`, `export function NieuweGroep({ onDone }: { onDone(id: string): void })`, `export function Vakanties()`; `Dashboard` krijgt props `view?: "leerlingen" | "groepen"`, `onView?(v): void`, `onOpenGroup?(id)`, `onNewGroup?()`, `onHolidays?()`.

- [ ] **Step 1: Schrijf de falende e2e-test**

`apps/e2e/tests/groepen.spec.ts`:

```ts
// AC-124 stap 2: lesgroepen beheren.
import type { Page } from "@playwright/test";
import { expect, inloggen, test, type Gebruiker } from "../fixtures";

/** een leraar met twee gekoppelde leerlingen die zelf inloggen */
async function klas({ admin, maakGebruiker, maakKind }: { admin: import("@supabase/supabase-js").SupabaseClient; maakGebruiker: (r: "ouder" | "leraar" | "leerling", n?: string) => Promise<Gebruiker>; maakKind: (o: Gebruiker, n: string) => Promise<string> }) {
  const leraar = await maakGebruiker("leraar", "Juf Marieke");
  const ouder = await maakGebruiker("ouder", "Papa");
  const noor = await maakKind(ouder, "Noor");
  const sem = await maakKind(ouder, "Sem");
  await admin.from("students").update({ age_band: "9-12", onboarded_at: new Date().toISOString() }).in("id", [noor, sem]);
  await admin.from("teacher_students").insert([{ teacher_id: leraar.id, student_id: noor }, { teacher_id: leraar.id, student_id: sem }]);
  return { leraar, ouder, noor, sem };
}

async function naarGroepen(page: Page) {
  await page.getByRole("group", { name: "Weergave leerlingen" }).getByRole("button", { name: "Groepen" }).click();
}

test("een leraar maakt een groep met rooster", async ({ page, admin, maakGebruiker, maakKind }) => {
  const { leraar } = await klas({ admin, maakGebruiker, maakKind });
  await inloggen(page, leraar);
  await naarGroepen(page);
  await page.getByRole("button", { name: "+ Nieuwe groep" }).click();
  await page.getByRole("textbox", { name: "Naam" }).fill("Samenspel");
  await page.getByRole("checkbox", { name: "Noor" }).check();
  await page.getByRole("checkbox", { name: "Sem" }).check();
  await page.getByRole("group", { name: "Lesdag" }).getByRole("button", { name: "za" }).click();
  await page.getByLabel("Begintijd").fill("10:00");
  await page.getByRole("button", { name: "Groep maken" }).click();
  await expect(page.getByRole("heading", { name: "Samenspel" })).toBeVisible();
  await page.getByRole("button", { name: "← Groepen" }).click();
  await expect(page.getByRole("button", { name: /Samenspel/ })).toContainText("za 10:00 · 2 leerlingen");
});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `pnpm e2e groepen 2>&1 | grep -E "✘|✓|Error:" | head`
Expected: FAIL (geen groep "Weergave leerlingen").

- [ ] **Step 3: Bouw de schermen**

`apps/web/src/screens/Groepen.tsx`:

```tsx
import { useEffect, useState } from "react";
import clsx from "clsx";
import { dateKey, lessonOverview, nextLesson, type Holiday, type LessonGroup, type Schedule } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip, Segmented } from "@/components/ui";

/**
 * Lesgroepen (AC-124 stap 2, mock-up docs/mockups/Lesgroepen-beheren.html): de lijst bij Leerlingen | Groepen,
 * een nieuwe groep maken en de vakanties van de leraar. Een privéles staat in de lijst met de naam van de leerling.
 */
export const DAGEN: Array<[string, string]> = [["1", "ma"], ["2", "di"], ["3", "wo"], ["4", "do"], ["5", "vr"], ["6", "za"], ["0", "zo"]];
const DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
export const kort = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
export const roosterTekst = (s: Schedule) => (s.weekday === null ? "geen rooster" : `${DAG[s.weekday]}${s.startTime ? ` ${s.startTime}` : ""}`);

export function GroepenLijst({ onOpen, onNew, onHolidays }: { onOpen(id: string): void; onNew(): void; onHolidays(): void }) {
  const [groups, setGroups] = useState<LessonGroup[] | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  useEffect(() => {
    void Promise.all([client.groups.mine(), client.groups.holidays()]).then(([g, h]) => { setGroups(g); setHolidays(h); }).catch(() => setGroups([]));
  }, []);
  if (!groups) return <p className="text-muted">Laden…</p>;
  const today = dateKey(new Date());
  const rows = groups.map((g) => {
    const overview = lessonOverview(g.lessons, g.schedule, holidays, today);
    return { g, next: nextLesson(overview, today), last: overview.find((r) => r.date <= today && r.lesson) };
  }).sort((a, b) => (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999"));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Chip primary onClick={onNew}>+ Nieuwe groep</Chip>
        <Chip onClick={onHolidays}>Vakanties</Chip>
      </div>
      {rows.length === 0 && <p className="text-muted m-0">Nog geen groepen. Een privéles verschijnt hier zodra je huiswerk geeft.</p>}
      {rows.map(({ g, next, last }) => {
        const leden = g.members.filter((m) => !m.leftOn);
        return (
          <button key={g.id} type="button" onClick={() => onOpen(g.id)}
            className="rounded-3xl bg-surface p-4 flex items-center gap-3 text-left cursor-pointer">
            <span className="flex-1 min-w-0">
              <b className="font-display block">{g.displayName}{!g.name && <span className="font-normal text-muted"> · privéles</span>}</b>
              <span className="text-sm text-muted">{roosterTekst(g.schedule)}{g.name ? ` · ${leden.length} ${leden.length === 1 ? "leerling" : "leerlingen"}` : ""}</span>
            </span>
            <span className="text-right text-sm">
              {last && <span className="block text-muted">{last.status === "afgezegd" ? "afgezegd" : "laatste"}: {kort(last.date)}</span>}
              <span className="block">{next ? `volgende: ${kort(next.date)}` : "geen les gepland"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NieuweGroep({ onDone }: { onDone(id: string): void }) {
  const { students } = useApp();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [weekday, setWeekday] = useState<string>("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      onDone(await client.groups.create(name.trim(), chosen, { weekday: weekday === "" ? null : Number(weekday), startTime: time || null }));
    } catch { setError("Opslaan lukte niet. Probeer het nog een keer."); setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <label className="flex flex-col gap-1"><span className="text-sm text-muted">Naam</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" placeholder="Samenspel zaterdag" /></label>
      </section>
      <section aria-label="Leerlingen" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Leerlingen</span>
        {students.map((s) => (
          <label key={s.id} className={clsx("flex items-center gap-3 rounded-2xl border-2 p-3 cursor-pointer", chosen.includes(s.id) ? "border-ok bg-ok/10" : "border-line")}>
            <input type="checkbox" aria-label={s.name} checked={chosen.includes(s.id)} className="w-5 h-5 accent-[var(--color-ok)]"
              onChange={() => setChosen((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c, s.id]))} />
            <span>{s.name}</span>
          </label>
        ))}
      </section>
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Rooster</span>
        <Segmented value={weekday} onChange={setWeekday} label="Lesdag" options={DAGEN} />
        <label className="flex items-center gap-2"><span className="text-sm text-muted">Begintijd</span>
          <input type="time" aria-label="Begintijd" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5 ml-auto" /></label>
        <span className="text-xs text-muted">Leeg laten mag: dan kies je per les een datum.</span>
      </section>
      {error && <p className="text-sm text-accent m-0">{error}</p>}
      <Chip primary disabled={busy || !name.trim() || chosen.length === 0} onClick={() => void save()}>Groep maken</Chip>
    </div>
  );
}

export function Vakanties() {
  const [list, setList] = useState<Holiday[] | null>(null);
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = () => void client.groups.holidays().then(setList).catch(() => setList([]));
  useEffect(load, []);
  const add = async () => {
    setError(null);
    try { await client.groups.addHoliday(name.trim(), from, to); setName(""); setFrom(""); setTo(""); load(); }
    catch { setError("Dat lukte niet. Klopt de periode (hooguit 4 maanden)?"); }
  };
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <p className="text-muted m-0">Geen lessen in deze periodes, voor al je groepen. "Volgende les" springt eroverheen.</p>
      <section aria-label="Vakanties" className="rounded-3xl bg-surface p-4 flex flex-col gap-1">
        {list?.length === 0 && <span className="text-muted">Nog geen vakanties.</span>}
        {list?.map((h) => (
          <div key={h.id} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span className="flex-1"><b>{h.name || "Vakantie"}</b><span className="block text-sm text-muted">{kort(h.startDate)} – {kort(h.endDate)}</span></span>
            <button type="button" aria-label={`${h.name || "Vakantie"} verwijderen`} onClick={() => void client.groups.removeHoliday(h.id).then(load)}
              className="bg-transparent cursor-pointer text-muted px-2">✕</button>
          </div>
        ))}
      </section>
      <section aria-label="Nieuwe vakantie" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <input aria-label="Naam van de vakantie" value={name} onChange={(e) => setName(e.target.value)} placeholder="Herfstvakantie" className="rounded-xl border-2 border-line px-3 py-2" />
        <div className="flex gap-2">
          <label className="flex-1 flex flex-col gap-1"><span className="text-sm text-muted">Van</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" /></label>
          <label className="flex-1 flex flex-col gap-1"><span className="text-sm text-muted">Tot en met</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" /></label>
        </div>
        {error && <p className="text-sm text-accent m-0">{error}</p>}
        <Chip primary disabled={!from || !to} onClick={() => void add()}>Toevoegen</Chip>
      </section>
    </div>
  );
}
```

`Chip` moet `disabled` doorgeven; staat dat niet in zijn props, voeg het toe in `components/ui.tsx` (`disabled?: boolean` op de `<button>`).

`Dashboard.tsx`: voeg de props uit het Interfaces-blok toe. Voor een leraar (`isLeraar`) bovenaan de pagina:

```tsx
<div className="mb-3"><Segmented value={view ?? "leerlingen"} onChange={(v) => onView?.(v)} label="Weergave leerlingen" options={[["leerlingen", "Leerlingen"], ["groepen", "Groepen"]]} /></div>
{view === "groepen" ? <GroepenLijst onOpen={(id) => onOpenGroup?.(id)} onNew={() => onNewGroup?.()} onHolidays={() => onHolidays?.()} /> : (/* de bestaande inhoud */)}
```

`AppMetLogin.tsx`:
- `Screen` krijgt `"groep" | "groepnieuw" | "vakanties" | "les"`; `NavState` krijgt `groupId?: string; date?: string; view?: "leerlingen" | "groepen"` en die gaan mee in `go`, `onPop` en `extra` zoals `homeworkId`.
- Bij `current === "overzicht"` aan `Dashboard` meegeven: `view={extra.view}` en `onView={(v) => { window.history.replaceState({ ...window.history.state, view: v }, ""); setExtra((e) => ({ ...e, view: v })); }}`, `onOpenGroup={(id) => go("groep", { groupId: id, view: "groepen" })}`, `onNewGroup={() => go("groepnieuw", { view: "groepen" })}`, `onHolidays={() => go("vakanties", { view: "groepen" })}`.
- `{current === "groepnieuw" && <NieuweGroep onDone={(id) => { window.history.back(); setTimeout(() => go("groep", { groupId: id, view: "groepen" }), 0); }} />}` en `{current === "vakanties" && <Vakanties />}`.
- `backTo`: `"Groepen"` voor `groepnieuw`, `vakanties` en `groep`; titel: `"Nieuwe groep"`, `"Vakanties"`.
- De tab Leerlingen is ook actief op `groep`, `groepnieuw`, `vakanties`, `les`.
- `{current === "groep" && extra.groupId && <GroepPagina … />}` komt in Task 7; tot dan toont `groep` alleen de titel: zet de titel voor `groep` op de naam uit een kleine `useEffect` in Task 7. Voor de test van deze taak is het genoeg dat de kop "Samenspel" verschijnt: laat `NieuweGroep.onDone` voor nu `go("groep", …)` doen en zet in Task 6 een tijdelijke `<GroepKop groupId=… />` die `client.groups.get` laadt en `<h1>` met `displayName` toont — Task 7 vervangt hem door de groepspagina.

- [ ] **Step 4: Draai de e2e-test**

Run: `pnpm e2e groepen 2>&1 | grep -E "✘|✓|passed|failed"`
Expected: 2 passed (iPad en iPhone).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/e2e/tests/groepen.spec.ts
git commit -m "Leerlingen | Groepen, nieuwe groep en vakanties (AC-124 stap 2)"
```

---

### Task 7: Groepspagina, Les (verzetten/afzeggen), groepshuiswerk

**Files:**
- Create: `apps/web/src/screens/GroepPagina.tsx` (tabs Deze les, Volgende les, Lessen, Groep; en `LesBeheer`)
- Modify: `apps/web/src/screens/HuiswerkGeven.tsx` (groepsmodus)
- Modify: `apps/web/src/AppMetLogin.tsx` (schermen `groep`, `les`, huiswerk voor een groep)
- Modify: `apps/e2e/tests/groepen.spec.ts`

**Interfaces:**
- Consumes: `client.groups.get`, `cancelLesson`, `moveLesson`, `addMember`, `removeMember`, `rename`, `setSchedule`, `end`; `client.homework.giveToGroup`; `lessonOverview`; `useChildRows` uit `Dashboard.tsx` (oefenminuten deze week: `summary.week.minutes`).
- Produces: `export function GroepPagina({ groupId, tab, onTab, onGive, onOpenTask, onOpenLesson, onEnded }: { groupId: string; tab: GroepTab; onTab(t: GroepTab): void; onGive(): void; onOpenTask(studentId: string, assignmentId: string, lessonId: string): void; onOpenLesson(date: string): void; onEnded(): void; onTitle(name: string): void })`, `export type GroepTab = "deze" | "volgende" | "lessen" | "groep"`, `export function LesBeheer({ groupId, date, onDone }: { groupId: string; date: string; onDone(): void })`; `HuiswerkGeven` krijgt prop `groupId?: string`.

- [ ] **Step 1: Breid de e2e-test uit (falend)**

Voeg toe aan `groepen.spec.ts`:

```ts
test("groepshuiswerk, per leerling volgen en afzeggen", async ({ page, admin, maakGebruiker, maakKind }) => {
  const { leraar, noor, sem } = await klas({ admin, maakGebruiker, maakKind });
  await inloggen(page, leraar);
  await naarGroepen(page);
  await page.getByRole("button", { name: "+ Nieuwe groep" }).click();
  await page.getByRole("textbox", { name: "Naam" }).fill("Duo");
  await page.getByRole("checkbox", { name: "Noor" }).check();
  await page.getByRole("checkbox", { name: "Sem" }).check();
  const vandaag = new Date().getDay();
  const dag = ["zo", "ma", "di", "wo", "do", "vr", "za"][vandaag]!;
  await page.getByRole("group", { name: "Lesdag" }).getByRole("button", { name: dag }).click();
  await page.getByRole("button", { name: "Groep maken" }).click();
  await expect(page.getByRole("heading", { name: "Duo" })).toBeVisible();

  // groepshuiswerk voor deze les
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Samen inzetten");
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Duo sturen/ }).click();
  await expect(page.getByRole("heading", { name: "Duo" })).toBeVisible();
  const opdracht = page.getByRole("group", { name: "Wie is klaar met Samen inzetten" });
  await expect(opdracht.getByRole("button")).toHaveCount(2);

  // Noor vinkt af (via de database, zoals de leerling-app doet); de leraar ziet haar stip
  const { data: h } = await admin.from("homework").select("id, assignments!inner(title)").eq("assignments.title", "Samen inzetten").single();
  await admin.from("homework_done").insert({ homework_id: h!.id, student_id: noor });
  await page.reload();
  await expect(opdracht.getByRole("button", { name: "Noor: klaar" })).toBeVisible();
  await expect(opdracht.getByRole("button", { name: "Sem: nog niet" })).toBeVisible();

  // de les van volgende week afzeggen: het huiswerk loopt door
  await page.getByRole("group", { name: "Tabbladen" }).getByRole("button", { name: "Lessen" }).click();
  await page.getByRole("list", { name: "Lessen" }).getByRole("button", { name: /gepland/ }).last().click();
  await page.getByRole("textbox", { name: "Reden" }).fill("leraar ziek");
  await page.getByRole("button", { name: "Les afzeggen" }).click();
  await expect(page.getByRole("list", { name: "Lessen" })).toContainText("leraar ziek");
  const { data: les } = await admin.from("lessons").select("end_date").eq("status", "gegeven").limit(1).single();
  const over = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  expect(les!.end_date).toBe(over(13));

});
```

- [ ] **Step 2: Draai de test en zie hem falen**

Run: `pnpm e2e groepen 2>&1 | grep -E "✘|✓|Error:" | head`
Expected: de nieuwe test FAIL (geen knop "Huiswerk geven" op de groepspagina).

- [ ] **Step 3: Bouw de groepspagina**

`apps/web/src/screens/GroepPagina.tsx`:

```tsx
import { useEffect, useState } from "react";
import clsx from "clsx";
import { dateKey, isRunning, lessonOverview, type GroupLesson, type Holiday, type LessonGroup } from "@notenkraker/client";
import { client } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Chip, Segmented, Week } from "@/components/ui";
import { useChildRows } from "@/screens/Dashboard";
import { DAGEN, kort, roosterTekst } from "@/screens/Groepen";

/**
 * De pagina van een lesgroep (AC-124 stap 2): deze en volgende les met per leerling wie klaar is, het
 * lessenoverzicht, en de groep zelf (leden, naam, rooster, opheffen).
 */
export type GroepTab = "deze" | "volgende" | "lessen" | "groep";
const TABS: Array<[GroepTab, string]> = [["deze", "Deze les"], ["volgende", "Volgende les"], ["lessen", "Lessen"], ["groep", "Groep"]];

export function useGroup(groupId: string): [LessonGroup | null, Holiday[], () => void] {
  const [group, setGroup] = useState<LessonGroup | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    void Promise.all([client.groups.get(groupId), client.groups.holidays()]).then(([g, h]) => { setGroup(g); setHolidays(h); });
  }, [groupId, version]);
  return [group, holidays, () => setVersion((v) => v + 1)];
}

export function GroepPagina({ groupId, tab, onTab, onGive, onOpenTask, onOpenLesson, onEnded, onTitle }: {
  groupId: string; tab: GroepTab; onTab(t: GroepTab): void; onGive(): void;
  onOpenTask(studentId: string, assignmentId: string, lessonId: string): void; onOpenLesson(date: string): void; onEnded(): void; onTitle(name: string): void;
}) {
  const [group, holidays, reload] = useGroup(groupId);
  const rows = useChildRows();
  useEffect(() => { if (group) onTitle(group.displayName); }, [group, onTitle]);
  if (!group) return <p className="text-muted">Laden…</p>;
  const today = dateKey(new Date());
  const leden = group.members.filter((m) => !m.leftOn);
  const deze = group.lessons.find((l) => isRunning(l) && l.date <= today && l.endDate >= today);
  const volgende = [...group.lessons].reverse().find((l) => isRunning(l) && l.date > today);
  const minuten = (sid: string) => rows?.find((r) => r.student.id === sid)?.summary.week.minutes ?? 0;

  const lesBlok = (l: GroupLesson | undefined, leeg: string) => (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <section aria-label="Huiswerk" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">{l ? `Les ${kort(l.date)} · huiswerk tot ${kort(l.endDate)}` : leeg}</span>
        {l?.items.map((it) => (
          <div key={it.homeworkItemId} className="flex items-center gap-3 rounded-2xl border-2 border-line p-3">
            <span className="flex-1 min-w-0"><b>{it.title}</b>{it.week > 1 && <> <Week n={it.week} /></>}
              {it.recording && <span className="block text-sm text-muted">🎙️ {Object.keys(it.recordingsBy).length} van {leden.length} opgenomen</span>}</span>
            <span role="group" aria-label={`Wie is klaar met ${it.title}`} className="flex gap-1">
              {leden.map((m) => {
                const klaar = it.doneBy.includes(m.studentId) || (it.recording && (it.recordingsBy[m.studentId] ?? 0) > 0);
                return (
                  <button key={m.studentId} type="button" aria-label={`${m.name}: ${klaar ? "klaar" : "nog niet"}`} onClick={() => onOpenTask(m.studentId, it.assignmentId, l.id)}
                    className={clsx("w-7 h-7 rounded-full grid place-items-center cursor-pointer border-2", klaar ? "bg-ok border-ok text-white" : "bg-surface border-dashed border-line text-muted")}>
                    <span aria-hidden="true" className="text-xs font-bold">{m.name.slice(0, 1)}</span>
                  </button>
                );
              })}
            </span>
          </div>
        ))}
        <Chip primary onClick={onGive}>Huiswerk geven</Chip>
      </section>
      <section aria-label="Deze week geoefend" className="rounded-3xl bg-surface p-4 flex flex-col gap-1">
        <span className="text-sm text-muted">Deze week geoefend</span>
        {leden.map((m) => <div key={m.studentId} className="flex"><span className="flex-1">{m.name}</span><b>{minuten(m.studentId)} min</b></div>)}
      </section>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted m-0">{roosterTekst(group.schedule)} · {leden.map((m) => m.name).join(", ")}</p>
      <div><Segmented value={tab} onChange={onTab} label="Tabbladen" options={TABS} /></div>
      {tab === "deze" && lesBlok(deze, "Nog geen huiswerk voor deze les.")}
      {tab === "volgende" && lesBlok(volgende, "Nog niets klaargezet voor de volgende les.")}
      {tab === "lessen" && (
        <ul aria-label="Lessen" className="list-none m-0 p-0 rounded-3xl bg-surface p-2 flex flex-col">
          {lessonOverview(group.lessons, group.schedule, holidays, today).map((r) => {
            const kan = r.date >= today && (r.status === "gepland" || r.status === "afgezegd");
            const tekst = <><b>{kort(r.date)}</b>{r.time ? ` ${r.time}` : ""}{r.label && <span className="block text-sm text-muted">{r.label}</span>}
              {r.lesson && r.lesson.items.length > 0 && <span className="block text-sm text-muted">{r.lesson.items.length} opdrachten</span>}</>;
            const badge = <span className={clsx("text-xs font-bold rounded-full px-2 py-0.5", r.status === "gegeven" ? "bg-ok/15 text-ok" : r.status === "gepland" ? "bg-accent-soft" : "bg-les/40")}>{r.status}</span>;
            return (
              <li key={r.date} className="border-b border-line last:border-0">
                {kan
                  ? <button type="button" onClick={() => onOpenLesson(r.date)} className="w-full flex items-center gap-3 p-3 text-left bg-transparent cursor-pointer"><span className="flex-1">{tekst}</span>{badge}<span aria-hidden="true">›</span></button>
                  : <div className="flex items-center gap-3 p-3"><span className="flex-1">{tekst}</span>{badge}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {tab === "groep" && <GroepBeheer group={group} onChanged={reload} onEnded={onEnded} />}
    </div>
  );
}

function GroepBeheer({ group, onChanged, onEnded }: { group: LessonGroup; onChanged(): void; onEnded(): void }) {
  const { students } = useApp();
  const [name, setName] = useState(group.name);
  const [weekday, setWeekday] = useState(group.schedule.weekday === null ? "" : String(group.schedule.weekday));
  const [time, setTime] = useState(group.schedule.startTime ?? "");
  const [sure, setSure] = useState(false);
  const leden = group.members.filter((m) => !m.leftOn);
  const anderen = students.filter((s) => !leden.some((m) => m.studentId === s.id));
  const run = (p: Promise<unknown>) => void p.then(onChanged);
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <section aria-label="Leden" className="rounded-3xl bg-surface p-4 flex flex-col gap-1">
        <span className="text-sm text-muted">Leerlingen</span>
        {leden.map((m) => (
          <div key={m.studentId} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
            <span className="flex-1">{m.name} <span className="text-sm text-muted">sinds {kort(m.joinedOn)}</span></span>
            <button type="button" aria-label={`${m.name} uit de groep`} onClick={() => run(client.groups.removeMember(group.id, m.studentId))} className="bg-transparent cursor-pointer text-muted px-2">✕</button>
          </div>
        ))}
        {anderen.length > 0 && (
          <label className="flex items-center gap-2 mt-2"><span className="text-sm text-muted">Toevoegen</span>
            <select aria-label="Leerling toevoegen" value="" onChange={(e) => e.target.value && run(client.groups.addMember(group.id, e.target.value))} className="rounded-xl border-2 border-line px-2 py-1.5 ml-auto">
              <option value="">kies…</option>{anderen.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
        )}
        <span className="text-xs text-muted">Haal je iemand uit de groep, dan ziet hij vanaf vandaag geen nieuw groepshuiswerk meer. Zijn opnames en vinkjes blijven.</span>
      </section>
      {group.name && (
        <section className="rounded-3xl bg-surface p-4 flex gap-2 items-end">
          <label className="flex-1 flex flex-col gap-1"><span className="text-sm text-muted">Naam</span>
            <input aria-label="Naam van de groep" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl border-2 border-line px-3 py-2" /></label>
          <Chip disabled={!name.trim() || name === group.name} onClick={() => run(client.groups.rename(group.id, name.trim()))}>Opslaan</Chip>
        </section>
      )}
      <section className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Rooster</span>
        <Segmented value={weekday} onChange={setWeekday} label="Lesdag" options={DAGEN} />
        <label className="flex items-center gap-2"><span className="text-sm text-muted">Begintijd</span>
          <input type="time" aria-label="Begintijd" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5 ml-auto" /></label>
        <span className="text-xs text-muted">Een nieuwe dag geldt vanaf de volgende les; eerdere lessen blijven staan.</span>
        <Chip onClick={() => run(client.groups.setSchedule(group.id, { weekday: weekday === "" ? null : Number(weekday), startTime: time || null }))}>Rooster opslaan</Chip>
      </section>
      {group.name && (sure
        ? <Chip onClick={() => void client.groups.end(group.id).then(onEnded)}>Ja, groep opheffen</Chip>
        : <button type="button" onClick={() => setSure(true)} className="self-start bg-transparent text-accent font-semibold cursor-pointer">Groep opheffen</button>)}
    </div>
  );
}

export function LesBeheer({ groupId, date, onDone }: { groupId: string; date: string; onDone(): void }) {
  const [group] = useGroup(groupId);
  const [newDate, setNewDate] = useState(date);
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (group) setTime(group.lessons.find((l) => l.date === date)?.startTime ?? group.schedule.startTime ?? ""); }, [group, date]);
  const doe = (p: Promise<void>) => { setError(null); void p.then(onDone).catch(() => setError("Dat lukte niet. Staat er op die dag al een les, of ligt hij in het verleden?")); };
  return (
    <div className="flex flex-col gap-3 max-w-[560px]">
      <section aria-label="Verzetten" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Verzetten</span>
        <label className="flex items-center gap-2"><span className="flex-1">Datum</span><input type="date" aria-label="Nieuwe datum" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5" /></label>
        <label className="flex items-center gap-2"><span className="flex-1">Tijd</span><input type="time" aria-label="Nieuwe tijd" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-xl border-2 border-line px-3 py-1.5" /></label>
        <span className="text-xs text-muted">Alleen deze les; het rooster blijft zoals het is.</span>
        <Chip primary disabled={newDate === date} onClick={() => doe(client.groups.moveLesson(groupId, date, newDate, time || null))}>Verzetten</Chip>
      </section>
      <section aria-label="Afzeggen" className="rounded-3xl bg-surface p-4 flex flex-col gap-2">
        <span className="text-sm text-muted">Afzeggen</span>
        <input aria-label="Reden" value={reason} onChange={(e) => setReason(e.target.value)} placeholder='Reden (mag leeg), bijv. "leraar ziek"' className="rounded-xl border-2 border-line px-3 py-2" />
        <span className="text-xs text-muted">Het huiswerk van de vorige les loopt door tot de les erna. Wat je al klaarzette, schuift mee.</span>
        <Chip onClick={() => doe(client.groups.cancelLesson(groupId, date, reason.trim()))}>Les afzeggen</Chip>
      </section>
      {error && <p className="text-sm text-accent m-0">{error}</p>}
    </div>
  );
}
```

`useChildRows` moet uit `Dashboard.tsx` geëxporteerd zijn (het is al `export function useChildRows`).

`HuiswerkGeven.tsx` — groepsmodus met prop `groupId?: string`:
- Laad bij `groupId` de groep met `client.groups.get(groupId)` in een state `group`; `studentIds` wordt `group.members.filter(m => !m.leftOn).map(m => m.studentId)` (de bovenliggende `AppMetLogin` geeft voor een groep `studentIds={[]}` en `groupId`); `student` = het eerste lid (voor het instrument en de noten).
- `who` = `group.displayName`; de knoptekst wordt daarmee "Opslaan en naar Duo sturen".
- `lopend` bij een groep: de les `group.lessons.find(l => isRunning(l) && l.date <= today && l.endDate >= today)`, met `tasks` = `items.map(it => ({ id: it.assignmentId, title: it.title, week: it.week, recordings: [], doneAt: null }))` — maak hiervoor een kleine functie `looptNogUitGroep(l: GroupLesson)` die de velden levert die het "Loopt nog"-blok leest (`id`, `title`, `week`, `recordings`, `doneAt`).
- `existing` bij een groep: `group.lessons.find(l => isRunning(l) && l.endDate >= today && (lesson === "deze" ? l.date <= today : l.date > today))`.
- `save`: bij een groep `await client.homework.giveToGroup(groupId, lesson, input, withBank.map(toInput), meegaand.map(t => t.id))`.
- Het blok `Lesdag` (rooster per leerling) wordt bij een groep niet getoond; de periode komt uit `group.schedule.weekday` (`lessonPeriod(group.schedule.weekday, l)`).

`AppMetLogin.tsx`:
- `{current === "groep" && extra.groupId && <GroepPagina groupId={extra.groupId} tab={(extra.groupTab ?? "deze")} onTab={(t) => { window.history.replaceState({ ...window.history.state, groupTab: t }, ""); setExtra((e) => ({ ...e, groupTab: t })); }} onGive={() => go("huiswerk", { groupId: extra.groupId, studentIds: [], view: "groepen" })} onOpenTask={(sid, aid, lid) => go("taak", { taskId: aid, studentIds: [sid], homeworkId: lid, groupId: extra.groupId })} onOpenLesson={(date) => go("les", { groupId: extra.groupId, date })} onEnded={() => go("overzicht", { view: "groepen" })} />}` — `NavState` krijgt `groupTab?: GroepTab`.
- `{current === "les" && extra.groupId && extra.date && <LesBeheer groupId={extra.groupId} date={extra.date} onDone={() => window.history.back()} />}`; titel `Les ${kort(extra.date)}`, terug-knop "Lessen".
- `huiswerk` met `extra.groupId`: `<HuiswerkGeven key={`groep-${extra.groupId}`} studentIds={[]} groupId={extra.groupId} onDone={() => window.history.back()} />`; titel `Huiswerk voor de groep`; render-voorwaarde wordt `homeworkFor.length > 0 || extra.groupId`.
- Titel van `groep`: de naam. Laad die in `GroepPagina` niet dubbel: geef `AppMetLogin` een state `groupTitle` die `GroepPagina` via een prop `onTitle(name)` zet, en toon `<h1>{groupTitle}</h1>`; verwijder de tijdelijke `GroepKop` uit Task 6.
- `taak` met `extra.groupId`: terug-knop "Terug".

- [ ] **Step 4: Draai de e2e-tests**

Run: `pnpm e2e groepen 2>&1 | grep -E "✘|✓|passed|failed"`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/e2e/tests/groepen.spec.ts
git commit -m "Groepspagina: deze en volgende les per leerling, lessenoverzicht, verzetten en afzeggen, groepshuiswerk (AC-124 stap 2)"
```

---

### Task 8: Leerling in twee groepen, kindpagina, Herhalen eerlijk, vakantie e2e

**Files:**
- Modify: `apps/web/src/screens/KindPagina.tsx`
- Modify: `apps/web/src/components/LeerlingenTabel.tsx` (melding na Herhalen)
- Modify: `apps/e2e/tests/groepen.spec.ts`

**Interfaces:**
- Consumes: `client.groups.mine()`, `planVandaag` met `groep`-rijen (Task 5).
- Produces: `KindPagina` prop `onOpenGroup?(groupId: string): void`.

- [ ] **Step 1: Breid de e2e-test uit (falend)**

Voeg toe aan `groepen.spec.ts`:

```ts
test("de leraar ziet op de kindpagina in welke groep het kind ook zit", async ({ page, admin, maakGebruiker, maakKind }) => {
  const { leraar } = await klas({ admin, maakGebruiker, maakKind });
  // privéles en groep voor Noor, elk met huiswerk
  await inloggen(page, leraar);
  await page.getByRole("button", { name: "Noor: details" }).click();
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Etude in G");
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Noor sturen/ }).click();
  await kiesInMenuTerug(page);
  await naarGroepen(page);
  await page.getByRole("button", { name: "+ Nieuwe groep" }).click();
  await page.getByRole("textbox", { name: "Naam" }).fill("Samenspel");
  await page.getByRole("checkbox", { name: "Noor" }).check();
  await page.getByRole("checkbox", { name: "Sem" }).check();
  await page.getByRole("button", { name: "Groep maken" }).click();
  await page.getByRole("button", { name: "Huiswerk geven" }).click();
  await page.getByRole("button", { name: "+ Nieuwe opdracht" }).click();
  await page.getByRole("textbox", { name: "Titel van de opdracht" }).fill("Ode an die Freude");
  for (const k of ["Volgende: doel", "Volgende: versturen"]) { const b = page.getByRole("button", { name: k }); if (await b.isVisible()) await b.click(); }
  await page.getByRole("button", { name: /naar Samenspel sturen/ }).click();
  // kindpagina: "Ook in: Samenspel"
  await page.getByRole("group", { name: "Weergave leerlingen" }).getByRole("button", { name: "Leerlingen" }).click();
  await page.getByRole("button", { name: "Noor: details" }).click();
  await expect(page.getByRole("button", { name: "Ook in: Samenspel →" })).toBeVisible();
});

/** terug naar Leerlingen vanaf een kindpagina */
async function kiesInMenuTerug(page: Page) {
  await page.getByRole("button", { name: /^← / }).click();
}
```

De Vandaag-kant (twee kopjes) is al gedekt door de unit-test in Task 5; deze e2e dekt de kindpagina.

Voeg ook een vakantietest toe:

```ts
test("vakantie: de volgende les springt eroverheen", async ({ page, admin, maakGebruiker, maakKind }) => {
  const { leraar } = await klas({ admin, maakGebruiker, maakKind });
  await inloggen(page, leraar);
  await naarGroepen(page);
  await page.getByRole("button", { name: "+ Nieuwe groep" }).click();
  await page.getByRole("textbox", { name: "Naam" }).fill("Trio");
  await page.getByRole("checkbox", { name: "Noor" }).check();
  const dag = ["zo", "ma", "di", "wo", "do", "vr", "za"][new Date().getDay()]!;
  await page.getByRole("group", { name: "Lesdag" }).getByRole("button", { name: dag }).click();
  await page.getByRole("button", { name: "Groep maken" }).click();
  await page.getByRole("button", { name: "← Groepen" }).click();
  await page.getByRole("button", { name: "Vakanties" }).click();
  const over = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  await page.getByRole("textbox", { name: "Naam van de vakantie" }).fill("Herfst");
  await page.getByLabel("Van").fill(over(1));
  await page.getByLabel("Tot en met").fill(over(9));
  await page.getByRole("button", { name: "Toevoegen" }).click();
  await expect(page.getByRole("region", { name: "Vakanties" })).toContainText("Herfst");
  await page.getByRole("button", { name: "← Groepen" }).click();
  const volgende = new Date(); volgende.setDate(volgende.getDate() + 14);
  await expect(page.getByRole("button", { name: /Trio/ })).toContainText(`volgende: ${volgende.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })}`);
});
```

- [ ] **Step 2: Draai de tests en zie ze falen**

Run: `pnpm e2e groepen 2>&1 | grep -E "✘|✓|Error:" | head`
Expected: de kindpagina-test FAIL (geen "Ook in: Samenspel"); de vakantietest kan al slagen (dan is dat de bevestiging van Task 6, noteer het).

- [ ] **Step 3: Implementeer**

`KindPagina.tsx`: voeg prop `onOpenGroup?(groupId: string): void` toe; laad voor een leraar (`profile?.role === "leraar"`) `client.groups.mine()` en toon boven de tabbladen, voor elke groep met naam waarin dit kind een huidig lid is:

```tsx
{groepen.map((g) => (
  <button key={g.id} type="button" onClick={() => onOpenGroup?.(g.id)} className="self-start text-sm font-semibold text-kent bg-transparent cursor-pointer p-0">Ook in: {g.name} →</button>
))}
```

met `const groepen = mine.filter((g) => g.name && g.members.some((m) => m.studentId === studentId && !m.leftOn));`. In `AppMetLogin` geef je `onOpenGroup={(id) => go("groep", { groupId: id, view: "groepen" })}` mee.

`LeerlingenTabel.tsx`, bij "Herhalen" (rond regel 51): bepaal vóór het geven of er al een volgende les van mij is (`prev`-achtige zoekactie op `homeworkAll`: `h.givenBy === profile?.id && isRunning(h) && h.startDate > today`), en zet na afloop de melding: bestond hij al → `"${naam}: opdrachten erbij gezet in de volgende les"`, anders `"${naam}: volgende les klaargezet"` (gebruik de bestaande meldings-state van de tabel; als er geen is, voeg een `useState<string | null>` toe en toon hem als `<p role="status" className="text-sm m-0">` boven de tabel).

- [ ] **Step 4: Draai de hele e2e-suite, unit en typecheck**

Run: `pnpm -r typecheck 2>&1 | grep "error TS"; pnpm test 2>&1 | grep -E "Tests |FAIL"; pnpm e2e 2>&1 | grep -E "✘|passed|failed"`
Expected: geen typefouten; alle tests passed; e2e alle passed (vorige 32 + de nieuwe).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src apps/e2e/tests/groepen.spec.ts
git commit -m "Kindpagina: ook in groep; Herhalen meldt wat er gebeurde; vakantie e2e (AC-124 stap 2)"
```

---

### Task 9: Database-suite en afronding

**Files:**
- Modify: geen nieuwe; alleen verificatie.

- [ ] **Step 1: Volledige database-suite**

Run: `npx -y supabase@2.120.0 db reset --local >/dev/null && npx -y supabase@2.120.0 test db 2>&1 | tail -15`
Expected: `All tests successful`.

- [ ] **Step 2: Volledige e2e-suite na de reset**

Run: `pnpm e2e 2>&1 | grep -E "✘|passed|failed"`
Expected: alle passed.

- [ ] **Step 3: Commit (alleen als er nog iets veranderd is)**

```bash
git status --short
```
Expected: schoon. Anders de wijzigingen committen met een omschrijving van wat er was.
