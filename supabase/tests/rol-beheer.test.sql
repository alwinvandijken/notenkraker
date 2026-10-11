-- Rol kiezen in beheer: een admin maakt iemand leerling, ouder of leraar.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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
insert into ids values ('alwin', gen_random_uuid()), ('luc', gen_random_uuid()), ('nieuw', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ((select id from ids where naam = 'alwin'), 'alwin@x.nl', '{"role":"ouder","display_name":"Alwin"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'luc'), 'luc@x.nl', '{"role":"ouder","display_name":"Luc"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'nieuw'), 'nieuw@x.nl', '{"display_name":"Nieuw"}', 'authenticated', 'authenticated');
select pg_temp.als_beheer();
update profiles set role = 'admin' where id = (select id from ids where naam = 'alwin');

select pg_temp.als((select id from ids where naam = 'luc'));
select throws_ok($$ select set_role(auth.uid(), 'leraar') $$, 'P0001', 'geen toegang', 'Je kunt jezelf geen leraar maken');

select pg_temp.als((select id from ids where naam = 'alwin'));
select lives_ok($$ select set_role((select id from ids where naam = 'luc'), 'leraar') $$, 'Admin maakt Luc leraar');
select is((select role from admin_users() where display_name = 'Luc'), 'leraar', 'Luc is leraar');
select throws_ok($$ select set_role((select id from ids where naam = 'luc'), 'admin') $$, 'P0001', 'rol niet toegestaan', 'Admin maken kan niet vanuit de app');
select throws_ok($$ select set_role(auth.uid(), 'ouder') $$, 'P0001', 'niet je eigen rol', 'De admin verandert zijn eigen rol niet per ongeluk');
select throws_ok($$ select set_role((select id from ids where naam = 'luc'), 'baas') $$, 'P0001', 'rol niet toegestaan', 'Een onbekende rol wordt geweigerd');

-- leerling worden: krijgt een eigen leerlingprofiel, maar maar één keer
select lives_ok($$ select set_role((select id from ids where naam = 'nieuw'), 'leerling') $$, 'Admin maakt iemand zonder rol leerling');
select set_role((select id from ids where naam = 'nieuw'), 'ouder');
select set_role((select id from ids where naam = 'nieuw'), 'leerling');
select pg_temp.als_beheer();
select is((select count(*)::int from students where user_id = (select id from ids where naam = 'nieuw')), 1, 'Een leerling heeft één eigen leerlingprofiel, ook na heen en weer');
select is((select name from students where user_id = (select id from ids where naam = 'nieuw')), 'Nieuw', 'Met zijn eigen naam');

select * from finish();
rollback;
