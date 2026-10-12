-- Huiswerk per les (0013): lesdag en lesperiode, toevoegen aan deze of volgende les, aanpassen zonder
-- opnieuw te beginnen, volgende les onzichtbaar voor de leerling, en stoppen.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

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
  ((select id from ids where naam = 'lotte'), 'lotte@x.nl', '{"display_name":"Lotte"}', 'authenticated', 'authenticated');
reset role;
update profiles set role = 'leraar' where id = (select id from ids where naam = 'marieke');
update profiles set role = 'leerling' where id = (select id from ids where naam = 'lotte');
select pg_temp.als((select id from ids where naam = 'olaf'));
with s as (insert into students (name, age_band) values ('Lotte', '9-12') returning id) insert into ids select 'kind', id from s;
select set_recording_consent((select id from ids where naam = 'kind'), true);
reset role;
update students set user_id = (select id from ids where naam = 'lotte') where id = (select id from ids where naam = 'kind');
insert into teacher_students values ((select id from ids where naam = 'marieke'), (select id from ids where naam = 'kind'));

-- Marieke geeft huiswerk met een stuk (opnemen) en een opdracht
select pg_temp.als((select id from ids where naam = 'marieke'));
select give_homework_with_tasks(array[(select id from ids where naam = 'kind')], '["g4"]', 15, 5, 'Rustig spelen', current_date + 7,
  jsonb_build_array(jsonb_build_object('kind', 'stuk', 'title', 'Lang zal ze leven', 'recording', true),
                    jsonb_build_object('kind', 'opdracht', 'title', 'Notenalfabet achteruit')));
reset role;
insert into ids select 'hw', id from homework;
insert into ids select 'stuk', id from homework_tasks where title = 'Lang zal ze leven';
insert into ids select 'opdr', id from homework_tasks where title = 'Notenalfabet achteruit';

-- Lotte vinkt af en neemt op
select pg_temp.als((select id from ids where naam = 'lotte'));
select set_task_done((select id from ids where naam = 'opdr'), true);
insert into storage.objects (bucket_id, name, owner) values ('opnames', (select id from ids where naam = 'kind') || '/' || (select id from ids where naam = 'stuk') || '/1.webm', auth.uid());
select submit_recording((select id from ids where naam = 'stuk'), (select id from ids where naam = 'kind') || '/' || (select id from ids where naam = 'stuk') || '/1.webm', 60);

-- ── Aanpassen ────────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'olaf'));
select throws_ok($$ select update_homework((select id from ids where naam = 'hw'), '[]', 10, 5, '', current_date, current_date + 7, '[]') $$,
  'P0001', 'geen toegang', 'Alleen wie het huiswerk gaf past het aan');
select pg_temp.als((select id from ids where naam = 'marieke'));
select lives_ok($$ select update_homework((select id from ids where naam = 'hw'), '["g4","a4"]', 20, 4, 'Let op je adem', current_date, current_date + 10,
  jsonb_build_array(
    jsonb_build_object('id', (select id from ids where naam = 'opdr'), 'kind', 'opdracht', 'title', 'Notenalfabet vooruit en achteruit'),
    jsonb_build_object('kind', 'opdracht', 'title', 'Toonladder G'))) $$, 'De leraar past het huiswerk aan');
select is((select count(*)::int from homework), 1, 'Er komt geen nieuw huiswerk bij');
select results_eq($$ select minutes_per_day, days_per_week, remark, due_date from homework $$,
  $$ values (20, 4, 'Let op je adem'::text, current_date + 10) $$, 'Doel, opmerking en einddatum zijn aangepast');
select is((select title from homework_tasks where id = (select id from ids where naam = 'opdr')), 'Notenalfabet vooruit en achteruit', 'De opdracht heeft de nieuwe titel');
select isnt((select done_at from homework_tasks where id = (select id from ids where naam = 'opdr')), null, 'en blijft afgevinkt');
select is((select count(*)::int from homework_tasks where title = 'Toonladder G'), 1, 'Een nieuwe opdracht komt erbij');
select is((select count(*)::int from homework_tasks where id = (select id from ids where naam = 'stuk')), 1,
  'Een weggehaald stuk met een opname blijft staan');
select is((select count(*)::int from task_recordings), 1, 'met zijn opname');
select is((select status from student_notes where note_id = 'a4'), 'les', 'Een nieuwe noot komt op "in de les"');

-- ── Lesperiode ───────────────────────────────────────────────────────
select is((select start_date from lesson_period((select id from ids where naam = 'kind'), 'deze')), current_date, 'Zonder lesdag begint deze les vandaag');
select is((select due_date from lesson_period((select id from ids where naam = 'kind'), 'volgende')), current_date + 13, 'en de volgende les loopt tot over twee weken');
reset role;
update students set lesson_weekday = extract(dow from current_date - 2)::int where id = (select id from ids where naam = 'kind');
select pg_temp.als((select id from ids where naam = 'marieke'));
select results_eq($$ select start_date, due_date from lesson_period((select id from ids where naam = 'kind'), 'deze') $$,
  $$ values (current_date - 2, current_date + 4) $$, 'Met een lesdag van eergisteren: de les liep vanaf eergisteren, een week');
select is((select start_date from lesson_period((select id from ids where naam = 'kind'), 'volgende')), current_date + 5, 'De volgende les begint op de volgende lesdag');

-- ── Toevoegen aan deze les: komt bij het lopende huiswerk ────────────
select lives_ok($$ select give_for_lesson(array[(select id from ids where naam = 'kind')], 'deze', '["b4"]', 10, 3, '',
  jsonb_build_array(jsonb_build_object('kind', 'opdracht', 'title', 'Ritme klappen'))) $$, 'Een opdracht toevoegen aan deze les');
select is((select count(*)::int from homework), 1, 'Geen nieuw huiswerk: de opdracht komt bij het lopende');
select is((select minutes_per_day from homework), 20, 'Het doel van het lopende huiswerk blijft');
select ok((select notes ? 'b4' and notes ? 'a4' from homework), 'De noten worden aangevuld');
select isnt((select done_at from homework_tasks where id = (select id from ids where naam = 'opdr')), null, 'Het vinkje blijft');

-- ── Volgende les: eigen huiswerk, nog niet zichtbaar voor de leerling ─
select lives_ok($$ select give_for_lesson(array[(select id from ids where naam = 'kind')], 'volgende', '[]', 15, 5, 'Nieuwe week',
  jsonb_build_array(jsonb_build_object('kind', 'stuk', 'title', 'Etude 2'))) $$, 'Huiswerk voor de volgende les');
select is((select count(*)::int from homework), 2, 'Dat is een eigen huiswerk');
select is((select start_date from homework where remark = 'Nieuwe week'), current_date + 5, 'Het begint op de volgende lesdag');
select pg_temp.als((select id from ids where naam = 'lotte'));
select is((select count(*)::int from homework), 1, 'De leerling ziet de volgende les nog niet');
select is((select count(*)::int from homework_tasks where title = 'Etude 2'), 0, 'ook de opdrachten niet');
select pg_temp.als((select id from ids where naam = 'olaf'));
select is((select count(*)::int from homework), 1, 'De ouder ook niet (die gaf het niet)');
select pg_temp.als((select id from ids where naam = 'marieke'));

-- ── Stoppen ──────────────────────────────────────────────────────────
select lives_ok($$ select end_homework((select id from ids where naam = 'hw')) $$, 'Huiswerk stoppen');
select is((select due_date from homework where id = (select id from ids where naam = 'hw')), current_date - 1, 'De einddatum is gisteren');

select * from finish();
rollback;
