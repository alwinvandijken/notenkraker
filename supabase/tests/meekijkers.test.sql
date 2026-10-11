-- Meekijkers: een leerling ziet wie zijn ouder en leraren zijn (hun profielen mag hij niet lezen).
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

delete from auth.users;
create function pg_temp.als(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;
create temp table ids (naam text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('olaf', gen_random_uuid()), ('marieke', gen_random_uuid()), ('lotte', gen_random_uuid()), ('mila', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ((select id from ids where naam = 'olaf'), 'olaf@x.nl', '{"role":"ouder","display_name":"Olaf"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'lotte'), 'lotte@x.nl', '{"display_name":"Lotte"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'mila'), 'mila@x.nl', '{"role":"leerling","display_name":"Mila"}', 'authenticated', 'authenticated');
select pg_temp.als((select id from ids where naam = 'olaf'));
with s as (insert into students (name) values ('Lotte') returning id) insert into ids select 'kind', id from s;
reset role;
update profiles set role = 'leraar' where id = (select id from ids where naam = 'marieke');
update profiles set role = 'leerling' where id = (select id from ids where naam = 'lotte');
update students set user_id = (select id from ids where naam = 'lotte') where id = (select id from ids where naam = 'kind');
insert into teacher_students values ((select id from ids where naam = 'marieke'), (select id from ids where naam = 'kind'));

select pg_temp.als((select id from ids where naam = 'lotte'));
select is((select string_agg(role || ':' || name, ', ' order by role) from my_guardians()), 'leraar:Marieke, ouder:Olaf',
  'Leerling ziet haar ouder en leraar');
select is((select count(*)::int from profiles), 1, 'Hun profielen leest ze nog steeds niet');

select pg_temp.als((select id from ids where naam = 'mila'));
select is((select count(*)::int from my_guardians()), 0, 'Een leerling met een eigen profiel heeft (nog) geen meekijkers');

select pg_temp.als((select id from ids where naam = 'olaf'));
select is((select count(*)::int from my_guardians()), 0, 'Voor een ouder zelf geeft het niets');

select * from finish();
rollback;
