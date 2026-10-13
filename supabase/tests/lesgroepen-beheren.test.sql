-- Lesgroepen beheren (0015, AC-124 stap 2): periodes, vakanties, zichtbaarheid per lidmaatschap.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

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
-- een opname alleen bij een huidig lid
reset role;
update group_members set left_on = current_date where group_id = pg_temp.id('band') and student_id = pg_temp.id('noor');
select pg_temp.als(pg_temp.id('noor_user'));
select throws_ok($$ select submit_recording((select id from assignments where title = 'Na'), pg_temp.id('noor'), 'x', 0) $$, 'P0001', 'geen toegang', 'Een opname alleen bij een huidig lid');

select * from finish();
rollback;
