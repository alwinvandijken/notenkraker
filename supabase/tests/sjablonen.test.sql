-- Huiswerk voor meerdere leerlingen en sjablonen (AC-117).
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

delete from auth.users;
create function pg_temp.als(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;
create temp table ids (naam text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('marieke', gen_random_uuid()), ('olaf', gen_random_uuid()), ('lotte', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ((select id from ids where naam = 'marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'olaf'), 'olaf@x.nl', '{"role":"ouder","display_name":"Olaf"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'lotte'), 'lotte@x.nl', '{"role":"leerling","display_name":"Lotte"}', 'authenticated', 'authenticated');
reset role;
update profiles set role = 'leraar' where id = (select id from ids where naam = 'marieke');

-- Marieke heeft twee eigen leerlingen; Olaf een kind dat niet van haar is
select pg_temp.als((select id from ids where naam = 'marieke'));
with s as (insert into students (name) values ('Sem'), ('Noor') returning id, name) insert into ids select lower(name), id from s;
select pg_temp.als((select id from ids where naam = 'olaf'));
with s as (insert into students (name) values ('Daan') returning id) insert into ids select 'daan', id from s;

-- Huiswerk voor meer leerlingen tegelijk geeft de app nu per leerling (give_homework per privégroep, 0014);
-- de weigering voor een leerling die niet van jou is, staat in lesgroepen-functies.test.sql (ensure_group).
select pg_temp.als((select id from ids where naam = 'marieke'));

-- ── Sjablonen ────────────────────────────────────────────────────────
select lives_ok($$ insert into homework_templates (name, notes, minutes_per_day, days_per_week, piece)
  values ('Toonladder G, 15 min', '["g4","a4"]', 15, 5, 'Toonladder G') $$, 'Leraar bewaart een sjabloon');
select is((select owner_id from homework_templates), (select id from ids where naam = 'marieke'), 'Het sjabloon is van haar');

select pg_temp.als((select id from ids where naam = 'olaf'));
select is((select count(*)::int from homework_templates), 0, 'Een ander ziet haar sjablonen niet');
select lives_ok($$ insert into homework_templates (name, minutes_per_day, days_per_week) values ('Vakantie', 10, 3) $$, 'Een ouder mag ook sjablonen bewaren');

select pg_temp.als((select id from ids where naam = 'lotte'));
select throws_ok($$ insert into homework_templates (name, minutes_per_day, days_per_week) values ('x', 10, 3) $$, '42501', null, 'Een leerling bewaart geen sjablonen');

select pg_temp.als((select id from ids where naam = 'marieke'));
delete from homework_templates;
select is((select count(*)::int from homework_templates), 0, 'Leraar verwijdert haar sjabloon');

select * from finish();
rollback;
