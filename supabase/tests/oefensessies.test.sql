-- Oefentimer (AC-112): de server legt start en einde vast en controleert de gespeelde tijd.
-- Draaien: supabase start && supabase test db
-- now() staat vast binnen een transactie; verstreken tijd simuleren we door started_at terug te zetten.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from auth.users;

create function pg_temp.nieuwe_gebruiker(email text, meta jsonb default '{}') returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, aud, role) values (uid, email, meta, 'authenticated', 'authenticated');
  return uid;
end $$;
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
insert into ids values ('lotte', pg_temp.nieuwe_gebruiker('lotte@x.nl', '{"role":"leerling","display_name":"Lotte"}'));
insert into ids values ('ouder', pg_temp.nieuwe_gebruiker('ouder@x.nl', '{"role":"ouder","display_name":"Olaf"}'));
insert into ids select 'student', id from students where user_id = (select id from ids where naam = 'lotte');

-- ── Start ────────────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'lotte'));
insert into ids select 'sessie', (practice_start((select id from ids where naam = 'student'))).id;
select is((select count(*)::int from practice_sessions), 1, 'Leerling start een sessie');
select is((select started_at from practice_sessions), now(), 'Start is de tijd van de server');

select throws_ok($$ insert into practice_sessions (student_id) values ((select id from ids where naam = 'student')) $$,
  '42501', null, 'Leerling kan zelf geen sessie invoegen');
select throws_ok($$ update practice_sessions set played_seconds = 3600 $$,
  '42501', null, 'Leerling kan de gespeelde tijd niet zelf zetten');

select pg_temp.als((select id from ids where naam = 'ouder'));
select throws_ok($$ select practice_start((select id from ids where naam = 'student')) $$,
  'P0001', 'geen toegang', 'Vreemde kan geen sessie starten voor andermans kind');
select is((select count(*)::int from practice_sessions), 0, 'Vreemde ziet de sessie niet');

-- ── Bijwerken: 10 minuten later ──────────────────────────────────────
select pg_temp.als_beheer();
update practice_sessions set started_at = now() - interval '10 minutes';
select pg_temp.als((select id from ids where naam = 'lotte'));

select throws_ok($$ select practice_update((select id from ids where naam = 'sessie'),
  (select jsonb_agg(jsonb_build_object('s', 60, 'notes', '[]'::jsonb)) from generate_series(1, 20)), '[]') $$,
  'P0001', 'meer minuten dan er verstreken zijn', 'Meer minuten dan verstreken tijd wordt geweigerd');
select throws_ok($$ select practice_update((select id from ids where naam = 'sessie'), '[{"s": 90}]', '[]') $$,
  'P0001', 'ongeldige minuut', 'Meer dan 60 seconden in een minuut wordt geweigerd');

select lives_ok($$ select practice_update((select id from ids where naam = 'sessie'),
  '[{"s":50,"notes":["g4"]},{"s":40,"notes":["a4"]},{"s":0,"notes":[]},{"s":55,"notes":["b4","c5"]}]', '["g4","a4","b4","c5"]') $$,
  'Leerling werkt de sessie bij');
select is((select played_seconds from practice_sessions), 145, 'Gespeelde seconden zijn de som van de minuten');
select is((select (ended_at - started_at) from practice_sessions), interval '10 minutes', 'Einde is de tijd van de server');
select is((select label from practice_sessions), 'sax', 'Verschillende noten: label sax');

select lives_ok($$ select practice_update((select id from ids where naam = 'sessie'),
  (select jsonb_agg(jsonb_build_object('s', 60, 'notes', '["g4"]'::jsonb)) from generate_series(1, 5)), '["g4"]', true) $$,
  'Leerling sluit de sessie af');
select is((select label from practice_sessions), 'twijfel', 'Minuten lang dezelfde noot: label twijfel');

select * from finish();
rollback;
