-- Opnames en bladmuziek (AC-118 stap 1b): uploaden, opname insturen, toestemming, reageren, verlopen.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

delete from auth.users;
create function pg_temp.als(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;
create temp table ids (naam text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('marieke', gen_random_uuid()), ('olaf', gen_random_uuid()), ('lotte', gen_random_uuid()), ('vreemd', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ((select id from ids where naam = 'marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'olaf'), 'olaf@x.nl', '{"role":"ouder","display_name":"Olaf"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'lotte'), 'lotte@x.nl', '{"display_name":"Lotte"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'vreemd'), 'vreemd@x.nl', '{"role":"ouder","display_name":"Vreemd"}', 'authenticated', 'authenticated');
reset role;
update profiles set role = 'leraar' where id = (select id from ids where naam = 'marieke');
update profiles set role = 'leerling' where id = (select id from ids where naam = 'lotte');
-- Olaf is ouder van Lotte (9-12 jaar, eigen login), Marieke haar leraar
select pg_temp.als((select id from ids where naam = 'olaf'));
with s as (insert into students (name, age_band) values ('Lotte', '9-12') returning id) insert into ids select 'kind', id from s;
reset role;
update students set user_id = (select id from ids where naam = 'lotte') where id = (select id from ids where naam = 'kind');
insert into teacher_students values ((select id from ids where naam = 'marieke'), (select id from ids where naam = 'kind'));

-- ── Bladmuziek uploaden en huiswerk met een gevraagde opname ─────────
select pg_temp.als((select id from ids where naam = 'marieke'));
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('bladmuziek', (select id from ids where naam = 'marieke') || '/etude.pdf', auth.uid()) $$,
  'Leraar zet bladmuziek in haar eigen map');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('bladmuziek', (select id from ids where naam = 'olaf') || '/x.pdf', auth.uid()) $$,
  '42501', null, 'Niet in de map van een ander');
select isnt(give_homework(ensure_group((select id from ids where naam = 'kind')), 'deze', '[]', 15, 5, '',
  jsonb_build_array(jsonb_build_object('kind', 'stuk', 'title', 'Etude in G', 'sheet_path', (select id from ids where naam = 'marieke') || '/etude.pdf',
    'sheet_name', 'etude.pdf', 'recording', true),
    jsonb_build_object('kind', 'stuk', 'title', 'Zonder opname')), '{}'), null, 'Huiswerk met bladmuziek en een gevraagde opname');
select throws_ok($$ select give_homework(ensure_group((select id from ids where naam = 'kind')), 'deze', '[]', 15, 5, '',
  jsonb_build_array(jsonb_build_object('kind', 'stuk', 'title', 'x', 'sheet_path', (select id from ids where naam = 'olaf') || '/x.pdf')), '{}') $$,
  'P0001', 'ongeldige opdracht', 'Bladmuziek alleen uit de eigen map');
insert into ids select 'taak', id from assignments where title = 'Etude in G';
insert into ids select 'zonder', id from assignments where title = 'Zonder opname';

select pg_temp.als((select id from ids where naam = 'lotte'));
select is((select count(*)::int from storage.objects where bucket_id = 'bladmuziek'), 1, 'De leerling mag de bladmuziek van haar huiswerk openen');
select pg_temp.als((select id from ids where naam = 'vreemd'));
select is((select count(*)::int from storage.objects where bucket_id = 'bladmuziek'), 0, 'Een vreemde niet');

-- ── Toestemming ──────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'lotte'));
select throws_ok($$ select submit_recording((select id from ids where naam = 'taak'), (select id from ids where naam = 'kind'),
  (select id from ids where naam = 'kind') || '/' || (select id from ids where naam = 'taak') || '/1.webm') $$,
  'P0001', 'geen toestemming', 'Zonder toestemming van de ouder geen opname (kind onder 18)');
select throws_ok($$ select set_recording_consent((select id from ids where naam = 'kind'), true) $$, 'P0001', 'geen toegang', 'Het kind geeft zelf geen toestemming');
select pg_temp.als((select id from ids where naam = 'marieke'));
select throws_ok($$ select set_recording_consent((select id from ids where naam = 'kind'), true) $$, 'P0001', 'geen toegang', 'De leraar ook niet');
select pg_temp.als((select id from ids where naam = 'olaf'));
select lives_ok($$ select set_recording_consent((select id from ids where naam = 'kind'), true) $$, 'De ouder geeft toestemming');

-- ── Opname insturen ──────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'lotte'));
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('opnames',
  (select id from ids where naam = 'kind') || '/' || (select id from ids where naam = 'taak') || '/1.webm', auth.uid()) $$, 'De leerling zet haar opname in haar eigen map');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('opnames', gen_random_uuid() || '/x/1.webm', auth.uid()) $$,
  '42501', null, 'Niet in de map van een ander kind');
select lives_ok($$ select submit_recording((select id from ids where naam = 'taak'), (select id from ids where naam = 'kind'),
  (select id from ids where naam = 'kind') || '/' || (select id from ids where naam = 'taak') || '/1.webm') $$, 'De leerling stuurt de opname in');
select throws_ok($$ select submit_recording((select id from ids where naam = 'zonder'), (select id from ids where naam = 'kind'),
  (select id from ids where naam = 'kind') || '/' || (select id from ids where naam = 'zonder') || '/1.webm') $$, 'P0001', 'geen opname gevraagd', 'Bij een stuk zonder opname kan het niet');

select pg_temp.als((select id from ids where naam = 'marieke'));
select is((select count(*)::int from storage.objects where bucket_id = 'opnames'), 1, 'De leraar kan de opname beluisteren');
select pg_temp.als((select id from ids where naam = 'vreemd'));
select is((select count(*)::int from storage.objects where bucket_id = 'opnames'), 0, 'Een vreemde niet');

-- ── Reageren ─────────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'olaf'));
select throws_ok($$ select react_to_recording((select id from recordings limit 1), '👍', 'Mooi!') $$, 'P0001', 'geen toegang', 'Alleen de docent van de groep reageert');
select pg_temp.als((select id from ids where naam = 'marieke'));
select lives_ok($$ select react_to_recording((select id from recordings limit 1), '⭐', 'Mooi gespeeld!') $$, 'De leraar reageert');

-- ── Verlopen opnames (4 weken na de einddatum) ───────────────────────
reset role;
update lessons set date = current_date - 36;
select is((select count(*)::int from expired_recordings()), 1, 'Een opname van 30 dagen na de einddatum is verlopen');
update lessons set date = current_date - 16;
select is((select count(*)::int from expired_recordings()), 0, 'Na 10 dagen nog niet');

select * from finish();
rollback;
