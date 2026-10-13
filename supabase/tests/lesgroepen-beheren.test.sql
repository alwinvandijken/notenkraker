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
