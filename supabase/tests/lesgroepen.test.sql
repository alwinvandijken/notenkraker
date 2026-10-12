-- Lesgroepen, lessen, opdrachten (0014, AC-124): het model, het overzetten van de oude data, en de functies.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- ── Model ────────────────────────────────────────────────────────────
select has_table('public', 'lesson_groups', 'lesgroepen');
select has_table('public', 'lessons', 'lessen');
select has_table('public', 'assignments', 'opdrachten');
select has_table('public', 'homework', 'huiswerk (les × opdracht)');
select hasnt_table('public', 'homework_tasks', 'oude opdrachten weg');
select hasnt_table('public', 'task_recordings', 'oude opnames weg');
select col_is_unique('public', 'lessons', array['group_id','date'], 'één les per groep per dag');

-- ── Overzetten van de oude data (het Annabel-geval) ──────────────────
delete from auth.users;
create temp table ids (naam text primary key, id uuid);
insert into ids values ('marieke', gen_random_uuid()), ('lotte', gen_random_uuid()),
  ('h1', gen_random_uuid()), ('h2', gen_random_uuid()), ('h3', gen_random_uuid()),
  ('t1', gen_random_uuid()), ('t2', gen_random_uuid()), ('t3', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ((select id from ids where naam = 'marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'lotte'), 'lotte@x.nl', '{"display_name":"Lotte"}', 'authenticated', 'authenticated');
insert into students (id, name, owner_id) values ((select id from ids where naam = 'lotte'), 'Lotte', (select id from ids where naam = 'lotte'));
-- de oude tabellen (bestaan na de migratie niet meer; hier alleen de kolommen die het overzetten leest)
alter table students add column if not exists lesson_weekday smallint;
create table if not exists homework_old (id uuid, student_id uuid, given_by uuid, given_by_role text, given_by_name text, created_at timestamptz,
  start_date date, due_date date, minutes_per_day int, days_per_week int, notes jsonb, remark text, piece text, piece_note text);
create table if not exists homework_tasks_old (id uuid, homework_id uuid, position int, kind text, title text, book_title text, book_author text,
  page text, chapter text, number text, track text, bank_id uuid, sheet_path text, sheet_name text, example_path text, recording boolean,
  done_at timestamptz, created_at timestamptz);
create table if not exists recordings_old (id uuid, task_id uuid, path text, seconds int, submitted_at timestamptz, deleted_at timestamptz,
  reaction_emoji text, reaction text, reacted_at timestamptz);
insert into homework_old (id, student_id, given_by, given_by_role, given_by_name, created_at, start_date, due_date, minutes_per_day, days_per_week, notes, remark, piece, piece_note)
select (select id from ids where naam = h), (select id from ids where naam = 'lotte'), (select id from ids where naam = 'marieke'), 'leraar', 'Marieke',
       now() - make_interval(hours => n), current_date, current_date + 2, 15, d, '[]', 'opmerking ' || h, '', ''
from (values ('h1', 3, 5), ('h2', 2, 2), ('h3', 1, 2)) v(h, n, d);
insert into homework_tasks_old (id, homework_id, position, kind, title, book_title, book_author, page, chapter, number, track, sheet_name, recording, done_at, created_at)
values ((select id from ids where naam = 't1'), (select id from ids where naam = 'h2'), 0, 'opdracht', 'Alfabet achteruit', '', '', '', '', '', '', '', false, now(), now()),
       ((select id from ids where naam = 't2'), (select id from ids where naam = 'h2'), 1, 'stuk', 'Lang zal ze leven', '', '', '', '', '', '', '', true, null, now()),
       ((select id from ids where naam = 't3'), (select id from ids where naam = 'h3'), 0, 'stuk', 'Vader Jacob', '', '', '', '', '', '', '', true, null, now());
insert into recordings_old (id, task_id, path, seconds, submitted_at, reaction_emoji, reaction)
select gen_random_uuid(), (select id from ids where naam = 't2'), 'x/' || n || '.webm', 5, now(), '', '' from generate_series(1, 2) n;
select lives_ok($$ select public.migrate_homework_to_lessons() $$, 'De oude data overzetten');
select is((select count(*)::int from lessons l join group_members m using (group_id) where m.student_id = (select id from ids where naam = 'lotte')), 1,
  'Drie oude huiswerken op één dag worden één les');
select is((select remark from lessons), 'opmerking h3', 'Met de instellingen van het nieuwste');
select is((select count(*)::int from homework), 3, 'Alle drie de opdrachten staan in die les');
select is((select count(*)::int from homework_done), 1, 'Het vinkje gaat mee');
select is((select count(*)::int from recordings where assignment_id = (select id from ids where naam = 't2')), 2, 'De twee opnames gaan mee, bij dezelfde opdracht');

select * from finish();
rollback;
