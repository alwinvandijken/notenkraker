-- Huiswerk (AC-113): een ouder of leraar geeft huiswerk, de leerling ziet het.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

delete from auth.users;
create function pg_temp.als(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.als_beheer() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

create temp table ids (naam text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('olaf', gen_random_uuid()), ('marieke', gen_random_uuid()), ('lotte', gen_random_uuid()), ('vreemd', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ((select id from ids where naam = 'olaf'), 'olaf@x.nl', '{"role":"ouder","display_name":"Olaf"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'lotte'), 'lotte@x.nl', '{"display_name":"Lotte"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'vreemd'), 'vreemd@x.nl', '{"role":"ouder","display_name":"Vreemd"}', 'authenticated', 'authenticated');

-- Olaf maakt Lotte aan; Lotte logt zelf in; Marieke is haar leraar
select pg_temp.als((select id from ids where naam = 'olaf'));
with s as (insert into students (name) values ('Lotte') returning id) insert into ids select 'kind', id from s;
select pg_temp.als_beheer();
update profiles set role = 'leraar' where id = (select id from ids where naam = 'marieke');
update profiles set role = 'leerling' where id = (select id from ids where naam = 'lotte');
update students set user_id = (select id from ids where naam = 'lotte') where id = (select id from ids where naam = 'kind');
insert into teacher_students values ((select id from ids where naam = 'marieke'), (select id from ids where naam = 'kind'));
insert into student_notes values ((select id from ids where naam = 'kind'), 'a4', 'kent', now());

create function pg_temp.geef(p_notes jsonb, p_minutes int, p_days int) returns uuid language sql as $$
  select give_homework(ensure_group((select id from ids where naam = 'kind')), 'deze', p_notes, p_minutes, p_days, '', '[]', '{}') $$;
grant execute on all functions in schema pg_temp to authenticated;

-- ── Ouder geeft huiswerk (in zijn thuis-groep) ───────────────────────
select pg_temp.als((select id from ids where naam = 'olaf'));
select lives_ok($$ select pg_temp.geef('["g4","a4"]', 10, 5) $$, 'Ouder geeft huiswerk');
select is((select g.kind || ' ' || g.teacher_name from lesson_groups g), 'thuis Olaf', 'Huiswerk weet van wie het is');
select is((select status from student_notes where note_id = 'g4'), 'les', 'Een noot uit het huiswerk komt op "in de les"');
select is((select status from student_notes where note_id = 'a4'), 'kent', 'Een noot die het kind al kent, blijft "kent"');

-- ── Leraar geeft ook huiswerk (in haar lesgroep) ─────────────────────
select pg_temp.als((select id from ids where naam = 'marieke'));
select lives_ok($$ select pg_temp.geef('["d4"]', 20, 5) $$, 'Leraar geeft huiswerk');
select is((select count(*)::int from lessons), 2, 'Leraar ziet de les van de ouder en die van zichzelf');
select throws_ok($$ update lessons set remark = 'van mij' where group_id in (select id from lesson_groups where kind = 'thuis') $$, '42501', null,
  'Leraar kan het huiswerk van de ouder niet wijzigen');

-- ── Leerling ziet het, maar geeft het niet ───────────────────────────
select pg_temp.als((select id from ids where naam = 'lotte'));
select is((select count(*)::int from lessons), 2, 'Leerling ziet het huiswerk van ouder en leraar');
select throws_ok($$ select pg_temp.geef('[]', 10, 5) $$, 'P0001', 'geen toegang', 'Leerling kan zichzelf geen huiswerk geven');
select throws_ok($$ insert into lessons (group_id, date) values ((select id from lesson_groups limit 1), current_date + 1) $$,
  '42501', null, 'Een les direct invoegen kan niet');

-- ── Vreemde ──────────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'vreemd'));
select is((select count(*)::int from lessons), 0, 'Vreemde ziet het huiswerk niet');
select throws_ok($$ select pg_temp.geef('[]', 10, 5) $$, 'P0001', 'geen toegang', 'Vreemde kan geen huiswerk geven');

-- ── Ongeldige waarden ────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'olaf'));
select throws_ok($$ select pg_temp.geef('[]', 0, 5) $$, 'P0001', 'ongeldig huiswerk', 'Nul minuten per dag wordt geweigerd');
select throws_ok($$ select pg_temp.geef('[]', 10, 8) $$, 'P0001', 'ongeldig huiswerk', 'Meer dan 7 dagen per week wordt geweigerd');
select throws_ok($$ select give_homework(ensure_group((select id from ids where naam = 'kind')), 'gisteren', '[]', 10, 5, '', '[]', '{}') $$,
  'P0001', 'ongeldige les', 'Alleen deze of de volgende les');
select throws_ok($$ select pg_temp.geef('{"g4":1}', 10, 5) $$, 'P0001', 'ongeldig huiswerk', 'Noten die geen lijst zijn worden geweigerd');

select * from finish();
rollback;
