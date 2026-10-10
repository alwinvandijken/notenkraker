-- Kennismaking (AC-115): leeftijd en ervaring per leerling.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

delete from auth.users;
create function pg_temp.als(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

create temp table ids (naam text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('lotte', gen_random_uuid()), ('vreemd', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select id, naam || '@x.nl', jsonb_build_object('role', 'leerling', 'display_name', naam), 'authenticated', 'authenticated' from ids;

select pg_temp.als((select id from ids where naam = 'lotte'));
select lives_ok($$ update students set age_band = '9-12', experience = 'lt1', onboarded_at = now() where user_id = auth.uid() $$,
  'Leerling vult leeftijd en ervaring in');
select is((select age_band from students where user_id = auth.uid()), '9-12', 'Leeftijdsgroep is opgeslagen');
select throws_ok($$ update students set age_band = '10' where user_id = auth.uid() $$, '23514', null,
  'Een onbekende leeftijdsgroep wordt geweigerd');
select throws_ok($$ update students set experience = 'veel' where user_id = auth.uid() $$, '23514', null,
  'Een onbekende ervaring wordt geweigerd');

select pg_temp.als((select id from ids where naam = 'vreemd'));
update students set age_band = '6-8' where user_id = (select id from ids where naam = 'lotte');
select pg_temp.als((select id from ids where naam = 'lotte'));
select is((select age_band from students where user_id = auth.uid()), '9-12', 'Een ander kan de leeftijd niet wijzigen');

select * from finish();
rollback;
