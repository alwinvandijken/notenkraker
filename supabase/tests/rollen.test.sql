-- Rolmodel (AC-106): leerling en ouder kies je zelf, leraar en admin wijst Alwin toe.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Lege lei (alles wordt aan het eind teruggedraaid), zodat de tellingen niet afhangen van lokale data.
delete from auth.users;

-- Hulpjes: een auth-gebruiker aanmaken (trigger maakt het profiel) en als die gebruiker handelen.
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

-- ── Nieuwe gebruikers ────────────────────────────────────────────────
create temp table ids (naam text primary key, id uuid);
grant select on ids to authenticated;

insert into ids values ('google', pg_temp.nieuwe_gebruiker('google@x.nl', '{"full_name":"Gerda Google"}'));
select is((select role from profiles where id = (select id from ids where naam = 'google')), null,
  'Google-login zonder rol: rol is nog leeg');
select is((select count(*)::int from students where owner_id = (select id from ids where naam = 'google')), 0,
  'Google-login zonder rol: nog geen leerlingprofiel');

insert into ids values ('leerling', pg_temp.nieuwe_gebruiker('leerling@x.nl', '{"role":"leerling","display_name":"Lotte"}'));
select is((select role from profiles where id = (select id from ids where naam = 'leerling')), 'leerling',
  'E-mailsignup als leerling: rol leerling');
select is((select count(*)::int from students where user_id = (select id from ids where naam = 'leerling')), 1,
  'E-mailsignup als leerling: eigen leerlingprofiel');

insert into ids values ('ouder', pg_temp.nieuwe_gebruiker('ouder@x.nl', '{"role":"ouder","display_name":"Olaf"}'));
select is((select role from profiles where id = (select id from ids where naam = 'ouder')), 'ouder',
  'E-mailsignup als ouder: rol ouder');
select is((select count(*)::int from students where owner_id = (select id from ids where naam = 'ouder')), 0,
  'E-mailsignup als ouder: geen leerlingprofiel');

insert into ids values ('stiekem', pg_temp.nieuwe_gebruiker('stiekem@x.nl', '{"role":"leraar"}'));
select is((select role from profiles where id = (select id from ids where naam = 'stiekem')), null,
  'Signup met rol leraar in metadata wordt genegeerd');
insert into ids values ('stiekem2', pg_temp.nieuwe_gebruiker('stiekem2@x.nl', '{"role":"admin"}'));
select is((select role from profiles where id = (select id from ids where naam = 'stiekem2')), null,
  'Signup met rol admin in metadata wordt genegeerd');

-- ── Eigen rol niet zelf te wijzigen ──────────────────────────────────
select pg_temp.als((select id from ids where naam = 'ouder'));
select throws_ok($$ update profiles set role = 'leraar' where id = auth.uid() $$, '42501', null,
  'Gebruiker kan eigen rol niet wijzigen');
select lives_ok($$ update profiles set display_name = 'Olaf B.' where id = auth.uid() $$,
  'Gebruiker kan eigen naam wel wijzigen');
select pg_temp.als_beheer();
select is((select display_name from profiles where id = (select id from ids where naam = 'ouder')), 'Olaf B.',
  'Naamswijziging is opgeslagen');

-- ── choose_role ──────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'google'));
select throws_ok($$ select choose_role('leraar') $$, 'P0001', 'rol niet toegestaan',
  'choose_role weigert leraar');
select throws_ok($$ select choose_role('admin') $$, 'P0001', 'rol niet toegestaan',
  'choose_role weigert admin');
select lives_ok($$ select choose_role('leerling') $$, 'choose_role leerling werkt');
select pg_temp.als_beheer();
select is((select role from profiles where id = (select id from ids where naam = 'google')), 'leerling',
  'Na choose_role: rol leerling');
select is((select count(*)::int from students where user_id = (select id from ids where naam = 'google')), 1,
  'Na choose_role leerling: eigen leerlingprofiel met Google-naam');
select pg_temp.als((select id from ids where naam = 'google'));
select throws_ok($$ select choose_role('ouder') $$, 'P0001', 'rol al gekozen',
  'choose_role werkt maar één keer');

-- ── Ouder maakt kinderen aan ─────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'ouder'));
select lives_ok($$ insert into students (name, instrument_id) values ('Kim', 'altsax'), ('Sam', 'altsax') $$,
  'Ouder maakt twee kinderen aan zonder owner_id mee te sturen');
select is((select count(*)::int from students), 2, 'Ouder ziet zijn twee kinderen');
select lives_ok($$ insert into students (name, instrument_id) values ('Tijdelijk', 'altsax') returning id $$,
  'Ouder krijgt het nieuwe kind terug (insert ... returning, zoals de client doet)');
delete from students where name = 'Tijdelijk';

select pg_temp.als((select id from ids where naam = 'leerling'));
select throws_ok($$ insert into students (name, instrument_id) values ('Extra', 'altsax') $$, '42501', null,
  'Leerling kan geen extra leerlingen aanmaken');

-- ── Kind koppelt eigen login met code van de ouder ───────────────────
select pg_temp.als((select id from ids where naam = 'ouder'));
create temp table codes (naam text primary key, code text);
grant all on codes to authenticated;
insert into codes values ('kind', create_invite_code((select id from students where name = 'Kim'), 'kind'));
select pg_temp.als((select id from ids where naam = 'stiekem'));
select throws_ok($$ select create_invite_code((select id from students where name = 'Kim' limit 1), 'kind') $$,
  'P0001', 'geen toegang', 'Vreemde kan geen code voor andermans kind maken');

select pg_temp.als_beheer();
insert into ids values ('kim', pg_temp.nieuwe_gebruiker('kim@x.nl', '{"full_name":"Kim"}'));
select pg_temp.als((select id from ids where naam = 'kim'));
select lives_ok($$ select claim_student((select code from codes where naam = 'kind')) $$,
  'Kind koppelt zich met de code');
select pg_temp.als_beheer();
select is((select user_id from students where name = 'Kim'), (select id from ids where naam = 'kim'),
  'Kind is gekoppeld aan het leerlingprofiel van de ouder');
select is((select role from profiles where id = (select id from ids where naam = 'kim')), 'leerling',
  'Kind heeft na koppelen rol leerling');
select is((select count(*)::int from students where user_id = (select id from ids where naam = 'kim')), 1,
  'Kind heeft geen tweede leerlingprofiel');
select is((select count(*)::int from invite_codes where code = (select code from codes where naam = 'kind')), 0,
  'Code is na gebruik weg');

-- Een leraarcode kan een kind niet gebruiken
select pg_temp.als((select id from ids where naam = 'ouder'));
insert into codes values ('leraar', create_invite_code((select id from students where name = 'Sam'), 'leraar'));
select pg_temp.als_beheer();
insert into ids values ('sam', pg_temp.nieuwe_gebruiker('sam@x.nl'));
select pg_temp.als((select id from ids where naam = 'sam'));
select throws_ok($$ select claim_student((select code from codes where naam = 'leraar')) $$,
  'P0001', 'code onbekend of verlopen', 'Leraarcode werkt niet om een kind te koppelen');

-- Een kind dat al zelf leerling koos (met een leeg eigen profiel) kan later alsnog koppelen
select pg_temp.als((select id from ids where naam = 'ouder'));
insert into codes values ('kind2', create_invite_code((select id from students where name = 'Sam'), 'kind'));
select pg_temp.als((select id from ids where naam = 'ouder'));
select throws_ok($$ select claim_student((select code from codes where naam = 'kind2')) $$,
  'P0001', 'alleen voor leerlingen', 'Een ouder kan zich niet als kind koppelen');
select pg_temp.als((select id from ids where naam = 'leerling'));
select lives_ok($$ select claim_student((select code from codes where naam = 'kind2')) $$,
  'Leerling met eigen profiel koppelt zich met de code');
select pg_temp.als_beheer();
select is((select array_agg(name) from students where user_id = (select id from ids where naam = 'leerling')), array['Sam'],
  'Leerling oefent nu alleen met het profiel van de ouder; het lege eigen profiel is weg');

-- ── Admin leest alles, schrijft niets ────────────────────────────────
select pg_temp.als_beheer();
insert into ids values ('admin', pg_temp.nieuwe_gebruiker('admin@x.nl'));
update profiles set role = 'admin' where id = (select id from ids where naam = 'admin');
select pg_temp.als((select id from ids where naam = 'admin'));
select is((select count(*)::int from students), 3, 'Admin ziet alle leerlingen');
select is_empty($$ update students set name = 'Gehackt' returning id $$, 'Admin kan leerlingen niet wijzigen');

select * from finish();
rollback;
