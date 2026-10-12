-- Meerdere opnames per opdracht (AC-121): insturen, weggooien, reageren per opname, verlopen,
-- en de oude kolommen op homework_tasks die de laatste opname volgen (app op productie).
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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
select pg_temp.als((select id from ids where naam = 'olaf'));
with s as (insert into students (name, age_band) values ('Lotte', '9-12') returning id) insert into ids select 'kind', id from s;
select set_recording_consent((select id from ids where naam = 'kind'), true);
reset role;
update students set user_id = (select id from ids where naam = 'lotte') where id = (select id from ids where naam = 'kind');
insert into teacher_students values ((select id from ids where naam = 'marieke'), (select id from ids where naam = 'kind'));

select pg_temp.als((select id from ids where naam = 'marieke'));
select give_homework_with_tasks(array[(select id from ids where naam = 'kind')], '[]', 15, 5, '', current_date + 7,
  jsonb_build_array(jsonb_build_object('kind', 'stuk', 'title', 'Lang zal ze leven', 'recording', true)));
insert into ids select 'taak', id from homework_tasks where title = 'Lang zal ze leven';
create function pg_temp.pad(n text) returns text language sql as $$
  select (select id from ids where naam = 'kind') || '/' || (select id from ids where naam = 'taak') || '/' || n || '.webm' $$;
grant execute on all functions in schema pg_temp to authenticated;

-- ── Twee opnames: maandag en zaterdag ────────────────────────────────
select pg_temp.als((select id from ids where naam = 'lotte'));
insert into storage.objects (bucket_id, name, owner) values ('opnames', pg_temp.pad('maandag'), auth.uid()), ('opnames', pg_temp.pad('zaterdag'), auth.uid());
select lives_ok($$ select submit_recording((select id from ids where naam = 'taak'), pg_temp.pad('maandag')) $$, 'Eerste opname insturen');
reset role;
update task_recordings set submitted_at = now() - interval '5 days';
select pg_temp.als((select id from ids where naam = 'lotte'));
select lives_ok($$ select submit_recording((select id from ids where naam = 'taak'), pg_temp.pad('zaterdag')) $$, 'Tweede opname insturen');
select is((select count(*)::int from task_recordings), 2, 'Allebei bewaard: de tweede vervangt de eerste niet');
select is((select recording_path from homework_tasks where id = (select id from ids where naam = 'taak')), pg_temp.pad('zaterdag'),
  'homework_tasks volgt de laatste opname (app op productie)');

select pg_temp.als((select id from ids where naam = 'marieke'));
select is((select count(*)::int from task_recordings), 2, 'De leraar ziet beide opnames');
select pg_temp.als((select id from ids where naam = 'vreemd'));
select is((select count(*)::int from task_recordings), 0, 'Een vreemde niet');

-- ── Reageren per opname ──────────────────────────────────────────────
reset role;
insert into ids select 'oud', id from task_recordings where path = pg_temp.pad('maandag');
insert into ids select 'nieuw', id from task_recordings where path = pg_temp.pad('zaterdag');
select pg_temp.als((select id from ids where naam = 'olaf'));
select throws_ok($$ select react_to_recording((select id from ids where naam = 'oud'), '👍', 'Goed') $$, 'P0001', 'geen toegang', 'Alleen wie het huiswerk gaf reageert');
select pg_temp.als((select id from ids where naam = 'marieke'));
select lives_ok($$ select react_to_recording((select id from ids where naam = 'oud'), '🙂', 'Nog wat stroef') $$, 'Reactie op maandag');
select lives_ok($$ select react_to_recording((select id from ids where naam = 'nieuw'), '⭐', 'Veel beter!') $$, 'Reactie op zaterdag');
select results_eq($$ select reaction from task_recordings order by submitted_at $$, $$ values ('Nog wat stroef'), ('Veel beter!') $$, 'Elke opname heeft zijn eigen reactie');
select is((select reaction from homework_tasks where id = (select id from ids where naam = 'taak')), 'Veel beter!', 'De oude kolom toont de reactie op de laatste');
select lives_ok($$ select react_to_task((select id from ids where naam = 'taak'), '🎉', 'Top') $$, 'De oude app reageert op de opdracht');
select is((select reaction from task_recordings where id = (select id from ids where naam = 'nieuw')), 'Top', 'Dat is een reactie op de laatste opname');

-- ── Weggooien ────────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'lotte'));
select throws_ok($$ delete from storage.objects where bucket_id = 'opnames' and name = pg_temp.pad('maandag') $$, null, null,
  'Een bestand dat nog bij een opname hoort, kan niet weg') ;
select pg_temp.als((select id from ids where naam = 'marieke'));
select throws_ok($$ select delete_recording((select id from ids where naam = 'oud')) $$, 'P0001', 'geen toegang', 'De leraar gooit geen opname van de leerling weg');
select pg_temp.als((select id from ids where naam = 'lotte'));
select is(delete_recording((select id from ids where naam = 'nieuw')), pg_temp.pad('zaterdag'), 'De leerling gooit een opname weg en krijgt het pad terug');
select is((select recording_path from homework_tasks where id = (select id from ids where naam = 'taak')), pg_temp.pad('maandag'),
  'homework_tasks wijst weer naar de opname die over is');

-- ── Verlopen ─────────────────────────────────────────────────────────
reset role;
update homework set due_date = current_date - 30;
select is((select count(*)::int from expired_recordings()), 1, 'De opname die over is, verloopt (geen dubbele door de oude kolom)');
select mark_recordings_deleted(array[(select id from ids where naam = 'taak')]);
select is((select count(*)::int from task_recordings where path is null and deleted_at is not null), 1, 'Na het opruimen: regel blijft, bestand weg');

select * from finish();
rollback;
