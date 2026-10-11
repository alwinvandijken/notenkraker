-- Feedback (AC-116): de beheerder zet per persoon aan wie feedback mag geven en leest alles.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from auth.users;
delete from feedback;
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
insert into ids values ('alwin', gen_random_uuid()), ('olaf', gen_random_uuid()), ('lotte', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role)
  select id, naam || '@x.nl', jsonb_build_object('role', 'ouder', 'display_name', initcap(naam)), 'authenticated', 'authenticated' from ids;
select pg_temp.als_beheer();
update profiles set role = 'admin' where id = (select id from ids where naam = 'alwin');

-- ── Standaard mag niemand ────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'olaf'));
select is((select can_give_feedback from profiles where id = auth.uid()), false, 'Standaard mag je geen feedback geven');
select throws_ok($$ select give_feedback('idee', 'Leuk!', 'Notenspel', '/app', 'iPhone', 'abc123') $$,
  'P0001', 'geen toegang', 'Zonder toestemming kun je geen feedback geven');
select throws_ok($$ update profiles set can_give_feedback = true where id = auth.uid() $$,
  '42501', null, 'Je kunt jezelf geen toestemming geven');
select throws_ok($$ select set_feedback_allowed(auth.uid(), true) $$,
  'P0001', 'geen toegang', 'Alleen de beheerder geeft toestemming');

-- ── Beheerder zet het aan ────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'alwin'));
select lives_ok($$ select set_feedback_allowed((select id from ids where naam = 'olaf'), true) $$, 'Beheerder geeft Olaf toestemming');
select is((select count(*)::int from admin_users()), 3, 'Beheerder ziet alle accounts');
select is((select email from admin_users() where display_name = 'Olaf'), 'olaf@x.nl', 'Met e-mail');

select pg_temp.als((select id from ids where naam = 'olaf'));
select lives_ok($$ select give_feedback('idee', 'Alleen nieuwe noten oefenen', 'Notenspel', '/app', 'iPhone', 'abc123') $$, 'Olaf geeft feedback');
select is((select count(*)::int from feedback), 0, 'Olaf leest geen feedback terug');
select throws_ok($$ select * from admin_users() $$, 'P0001', 'geen toegang', 'Alleen de beheerder ziet de accounts');
select throws_ok($$ select give_feedback('idee', '', 'Notenspel', '/app', 'iPhone', 'abc') $$,
  'P0001', 'ongeldige feedback', 'Lege feedback wordt geweigerd');

-- ── Beheerder leest en zet de status ─────────────────────────────────
select pg_temp.als((select id from ids where naam = 'alwin'));
select is((select role || ' ' || screen || ' ' || status from feedback), 'ouder Notenspel nieuw', 'Beheerder leest feedback met rol, pagina en status');
select lives_ok($$ update feedback set status = 'linear', linear_url = 'https://linear.app/x' $$, 'Beheerder zet de status');

select pg_temp.als((select id from ids where naam = 'olaf'));
update feedback set status = 'klaar';
select pg_temp.als((select id from ids where naam = 'alwin'));
select is((select status from feedback), 'linear', 'Een ander kan de status niet wijzigen');

select * from finish();
rollback;
