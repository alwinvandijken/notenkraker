-- Lesgroepen (0014, AC-124): groep, rooster, deze en volgende les, huiswerk geven en meenemen, vinkje per
-- leerling, aanpassen zonder reset, stoppen, voortgang, opnames en bewaartermijn.
-- Draaien: supabase start && supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

delete from auth.users;
create function pg_temp.als(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create temp table ids (naam text primary key, id uuid);
create function pg_temp.id(n text) returns uuid language sql as $$ select id from ids where naam = n $$;
grant all on ids to authenticated;
grant execute on all functions in schema pg_temp to authenticated;
insert into ids values ('marieke', gen_random_uuid()), ('olaf', gen_random_uuid()), ('lotte_user', gen_random_uuid()), ('vreemd', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  (pg_temp.id('marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  (pg_temp.id('olaf'), 'olaf@x.nl', '{"role":"ouder","display_name":"Olaf"}', 'authenticated', 'authenticated'),
  (pg_temp.id('lotte_user'), 'lotte@x.nl', '{"display_name":"Lotte"}', 'authenticated', 'authenticated'),
  (pg_temp.id('vreemd'), 'vreemd@x.nl', '{"role":"ouder","display_name":"Vreemd"}', 'authenticated', 'authenticated');
reset role;
update profiles set role = 'leraar' where id = pg_temp.id('marieke');
update profiles set role = 'leerling' where id = pg_temp.id('lotte_user');
-- Olaf is ouder van Lotte en Sem; Lotte logt zelf in; Marieke is hun leraar
insert into students (name, owner_id, age_band, recording_consent) values ('Lotte', pg_temp.id('olaf'), '9-12', true), ('Sem', pg_temp.id('olaf'), '9-12', true);
insert into students (name, owner_id) values ('Vreemd kind', pg_temp.id('vreemd'));
insert into ids select 'lotte', id from students where name = 'Lotte';
insert into ids select 'sem', id from students where name = 'Sem';
insert into ids select 'vreemd_kind', id from students where name = 'Vreemd kind';
update students set user_id = pg_temp.id('lotte_user') where id = pg_temp.id('lotte');
insert into teacher_students values (pg_temp.id('marieke'), pg_temp.id('lotte')), (pg_temp.id('marieke'), pg_temp.id('sem'));

-- ── Groep ────────────────────────────────────────────────────────────
select pg_temp.als(pg_temp.id('marieke'));
insert into ids select 'groep', ensure_group(pg_temp.id('lotte'));
select isnt(pg_temp.id('groep'), null, 'Privégroep van Marieke met Lotte');
select is(ensure_group(pg_temp.id('lotte')), pg_temp.id('groep'), 'Een tweede keer: dezelfde groep');
select is((select kind || ' ' || teacher_name from lesson_groups where id = pg_temp.id('groep')), 'les Marieke', 'Groep van een leraar is een les, met haar naam');
select throws_ok($$ select ensure_group(pg_temp.id('vreemd_kind')) $$, 'P0001', 'geen toegang', 'Alleen eigen leerlingen');

-- ── Deze en volgende les ─────────────────────────────────────────────
select is((lesson_for(pg_temp.id('groep'), 'deze')).date, current_date, 'Zonder rooster: deze les is vandaag');
select is((lesson_for(pg_temp.id('groep'), 'volgende')).date, current_date + 7, 'De volgende les over een week');
reset role;
delete from lessons;
select pg_temp.als(pg_temp.id('marieke'));
select lives_ok($$ select set_schedule(pg_temp.id('groep'), extract(dow from current_date - 2)::smallint, null) $$, 'Lesdag: eergisteren');
select is((lesson_for(pg_temp.id('groep'), 'deze')).date, current_date - 2, 'Met rooster: deze les was eergisteren');
select is((lesson_for(pg_temp.id('groep'), 'volgende')).date, current_date + 5, 'De volgende les op de volgende lesdag');

-- ── Huiswerk geven en meenemen ───────────────────────────────────────
insert into ids select 'deze', give_homework(pg_temp.id('groep'), 'deze', '["g4"]', 15, 5, 'Rustig spelen',
  jsonb_build_array(jsonb_build_object('kind', 'stuk', 'title', 'Lang zal ze leven', 'recording', true),
                    jsonb_build_object('kind', 'opdracht', 'title', 'Alfabet achteruit')), '{}');
insert into ids select 'stuk', id from assignments where title = 'Lang zal ze leven';
insert into ids select 'opdr', id from assignments where title = 'Alfabet achteruit';
insert into ids select 'hw_opdr', id from homework where assignment_id = pg_temp.id('opdr');
select is((select count(*)::int from homework where lesson_id = pg_temp.id('deze')), 2, 'Twee opdrachten als huiswerk in deze les');
select is((select status from student_notes where student_id = pg_temp.id('lotte') and note_id = 'g4'), 'les', 'De noot komt op "in de les"');

-- Lotte vinkt af en neemt twee keer op
select pg_temp.als(pg_temp.id('lotte_user'));
select lives_ok($$ select set_done(pg_temp.id('hw_opdr'), pg_temp.id('lotte'), true) $$, 'Lotte vinkt af');
insert into storage.objects (bucket_id, name, owner) values
  ('opnames', pg_temp.id('lotte') || '/' || pg_temp.id('stuk') || '/1.webm', auth.uid()),
  ('opnames', pg_temp.id('lotte') || '/' || pg_temp.id('stuk') || '/2.webm', auth.uid());
select lives_ok($$ select submit_recording(pg_temp.id('stuk'), pg_temp.id('lotte'), pg_temp.id('lotte') || '/' || pg_temp.id('stuk') || '/1.webm', 60) $$, 'Eerste opname');
select lives_ok($$ select submit_recording(pg_temp.id('stuk'), pg_temp.id('lotte'), pg_temp.id('lotte') || '/' || pg_temp.id('stuk') || '/2.webm', 30) $$, 'Tweede opname');
select is((select sum(played_seconds)::int from practice_sessions where label = 'opname'), 90, 'Opnemen telt als oefentijd');

-- het stuk gaat mee naar de volgende les
select pg_temp.als(pg_temp.id('marieke'));
insert into ids select 'volgende', give_homework(pg_temp.id('groep'), 'volgende', '[]', 15, 5, '', '[]', array[pg_temp.id('stuk')]);
select is((select count(*)::int from homework where assignment_id = pg_temp.id('stuk')), 2, 'Dezelfde opdracht in twee lessen');
select lives_ok($$ select give_homework(pg_temp.id('groep'), 'volgende', '[]', 15, 5, '', '[]', array[pg_temp.id('stuk')]) $$, 'Nog eens meenemen');
select is((select count(*)::int from homework where assignment_id = pg_temp.id('stuk')), 2, 'Geen dubbele huiswerkregel');
select is((select count(*)::int from recordings where assignment_id = pg_temp.id('stuk')), 2, 'De opnames blijven bij de opdracht');
select give_homework(pg_temp.id('groep'), 'volgende', '[]', 15, 5, '', jsonb_build_array(jsonb_build_object('kind', 'opdracht', 'title', 'Alleen volgende week')), '{}');

-- ── Wie ziet wat ─────────────────────────────────────────────────────
select pg_temp.als(pg_temp.id('lotte_user'));
select is((select count(*)::int from lessons where date > current_date), 0, 'Lotte ziet de volgende les nog niet');
select is((select count(*)::int from homework), 2, 'Lotte ziet alleen het huiswerk van deze les');
select is((select count(*)::int from assignments), 2, 'en de opdrachten van deze les (het stuk, ook in de volgende les, en de opdracht)');
-- Sem komt in de groep (een groepsles); zijn eigen ouder ziet het vinkje en de opnames van Lotte niet
reset role;
insert into group_members (group_id, student_id) values (pg_temp.id('groep'), pg_temp.id('sem'));
update students set owner_id = pg_temp.id('vreemd') where id = pg_temp.id('sem');
select pg_temp.als(pg_temp.id('vreemd'));
select is((select count(*)::int from homework), 2, 'Een groepslid ziet het huiswerk van de groep (deze les)');
select is((select count(*)::int from homework_done), 0, 'maar niet het vinkje van Lotte');
select is((select count(*)::int from recordings), 0, 'en niet haar opnames');
select throws_ok($$ select set_done(pg_temp.id('hw_opdr'), pg_temp.id('lotte'), true) $$, 'P0001', 'geen toegang', 'en vinkt niet af voor Lotte');

-- ── Aanpassen zonder reset ───────────────────────────────────────────
select pg_temp.als(pg_temp.id('marieke'));
select lives_ok($$ select update_lesson(pg_temp.id('deze'), '["g4"]', 20, 4, 'Let op je adem', current_date - 2,
  jsonb_build_array(jsonb_build_object('id', pg_temp.id('opdr'), 'kind', 'opdracht', 'title', 'Alfabet vooruit en achteruit'))) $$, 'Deze les aanpassen, het stuk eruit');
select is((select title from assignments where id = pg_temp.id('opdr')), 'Alfabet vooruit en achteruit', 'De opdracht heeft de nieuwe titel');
select is((select count(*)::int from homework_done where homework_id = pg_temp.id('hw_opdr')), 1, 'en blijft afgevinkt');
select is((select count(*)::int from assignments where id = pg_temp.id('stuk')), 1, 'Het stuk blijft (staat in de volgende les en heeft opnames)');

-- ── Stoppen ──────────────────────────────────────────────────────────
select lives_ok($$ select end_lesson(pg_temp.id('deze')) $$, 'Deze les stoppen');
select isnt((lesson_for(pg_temp.id('groep'), 'deze')).id, pg_temp.id('deze'), 'Een gestopte les telt niet als deze les');

-- ── Voortgang ────────────────────────────────────────────────────────
select lives_ok($$ select set_progress(pg_temp.id('stuk'), pg_temp.id('lotte'), 'klaar', 8.5) $$, 'Voortgang zetten');
select pg_temp.als(pg_temp.id('olaf'));
select throws_ok($$ select set_progress(pg_temp.id('stuk'), pg_temp.id('lotte'), 'klaar', 9) $$, 'P0001', 'geen toegang', 'Alleen de docent zet voortgang');

-- ── Bewaartermijn over lessen ────────────────────────────────────────
reset role;
update lessons set date = date - 60 where id = pg_temp.id('deze');
select is((select count(*)::int from expired_recordings()), 0, 'Niet verlopen zolang de opdracht nog in een latere les staat');

-- ── Review: stoppen en dezelfde dag opnieuw geven ────────────────────
reset role;
delete from schedule_rules;
select pg_temp.als(pg_temp.id('marieke'));
insert into ids select 'groep_sem', ensure_group(pg_temp.id('sem'));
select give_homework(pg_temp.id('groep_sem'), 'deze', '[]', 15, 5, 'Oud', jsonb_build_array(jsonb_build_object('kind', 'opdracht', 'title', 'Oude opdracht')), '{}');
select end_lesson((select id from lessons where group_id = pg_temp.id('groep_sem') and date = current_date));
select give_homework(pg_temp.id('groep_sem'), 'deze', '[]', 30, 3, 'Nieuw', jsonb_build_array(jsonb_build_object('kind', 'opdracht', 'title', 'Nieuwe opdracht')), '{}');
select results_eq($$ select a.title from homework h join assignments a on a.id = h.assignment_id join lessons l on l.id = h.lesson_id
  where l.group_id = pg_temp.id('groep_sem') and l.status not in ('afgezegd','gestopt') $$, $$ values ('Nieuwe opdracht') $$, 'Na stoppen: de oude opdracht komt niet terug');
select is((select minutes_per_day || ' ' || remark from lessons where group_id = pg_temp.id('groep_sem') and status not in ('afgezegd','gestopt')), '30 Nieuw', 'en het nieuwe doel geldt');

-- ── Review: opnames die in geen les meer staan, verlopen ook ─────────
reset role;
insert into assignments (id, group_id, created_by, kind, title, recording) values (gen_random_uuid(), pg_temp.id('groep'), pg_temp.id('marieke'), 'stuk', 'Los stuk', true);
insert into recordings (assignment_id, student_id, path, submitted_at) select id, pg_temp.id('lotte'), 'los/1.webm', now() - interval '40 days' from assignments where title = 'Los stuk';
select is((select count(*)::int from expired_recordings() where path = 'los/1.webm'), 1, 'Een opname zonder les verloopt 4 weken na het insturen');

-- ── Review: ontkoppelde leraar raakt de toegang kwijt ────────────────
delete from teacher_students where teacher_id = pg_temp.id('marieke') and student_id = pg_temp.id('lotte');
select pg_temp.als(pg_temp.id('marieke'));
select is((select count(*)::int from recordings where student_id = pg_temp.id('lotte')), 0, 'Na ontkoppelen ziet de leraar de opnames van Lotte niet meer');
select throws_ok($$ select give_homework(pg_temp.id('groep'), 'deze', '[]', 15, 5, '', '[]', '{}') $$, 'P0001', 'geen toegang', 'en geeft ze geen huiswerk meer');

select * from finish();
rollback;
