-- Opdrachten (AC-118, stap 1a): boeken, opdrachtenbank, opdrachten in het huiswerk, afvinken.
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
insert into ids values ('marieke', gen_random_uuid()), ('olaf', gen_random_uuid()), ('lotte', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data, aud, role) values
  ((select id from ids where naam = 'marieke'), 'marieke@x.nl', '{"display_name":"Marieke"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'olaf'), 'olaf@x.nl', '{"role":"ouder","display_name":"Olaf"}', 'authenticated', 'authenticated'),
  ((select id from ids where naam = 'lotte'), 'lotte@x.nl', '{"display_name":"Lotte"}', 'authenticated', 'authenticated');
reset role;
update profiles set role = 'leraar' where id = (select id from ids where naam = 'marieke');
update profiles set role = 'leerling' where id = (select id from ids where naam = 'lotte');

-- Marieke heeft leerlingen Sem en Noor; Sem logt zelf in als Lotte (eigen login)
select pg_temp.als((select id from ids where naam = 'marieke'));
with s as (insert into students (name) values ('Sem'), ('Noor') returning id, name) insert into ids select lower(name), id from s;
reset role;
update students set user_id = (select id from ids where naam = 'lotte') where id = (select id from ids where naam = 'sem');

-- ── Boeken ───────────────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'marieke'));
with b as (insert into books (title, author, has_audio) values ('Saxofoon Methode 1', 'De Haske', true) returning id) insert into ids select 'boek', id from b;
select is((select count(*)::int from books), 1, 'Leraar zet een boek in haar lijst');
select pg_temp.als((select id from ids where naam = 'olaf'));
select is((select count(*)::int from books), 0, 'Een ander ziet haar boeken niet');
select pg_temp.als((select id from ids where naam = 'lotte'));
select throws_ok($$ insert into books (title) values ('x') $$, '42501', null, 'Een leerling zet geen boeken');

-- ── Opdrachtenbank ───────────────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'marieke'));
with t as (insert into task_bank (kind, title, book_id, page, track, categories)
  values ('stuk', 'Toonladder G', (select id from ids where naam = 'boek'), '12', '4', array['Toonladders']) returning id)
  insert into ids select 'bank1', id from t;
with t as (insert into task_bank (kind, title, categories) values ('opdracht', 'Notenalfabet achteruit', array['Theorie']) returning id)
  insert into ids select 'bank2', id from t;
select is((select count(*)::int from task_bank), 2, 'Leraar bewaart opdrachten in haar bank');
select throws_ok($$ insert into task_bank (kind, title) values ('video', 'x') $$, '23514', null, 'Een onbekende soort wordt geweigerd');
select pg_temp.als((select id from ids where naam = 'olaf'));
select is((select count(*)::int from task_bank), 0, 'Een ander ziet haar bank niet');

-- ── Huiswerk met opdrachten ──────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'marieke'));
create function pg_temp.taken() returns jsonb language sql as $$ select jsonb_build_array(
    jsonb_build_object('kind', 'stuk', 'title', 'Lang zal ze leven', 'book_id', (select id from ids where naam = 'boek'), 'page', '23', 'chapter', '4', 'number', '12', 'track', '17'),
    jsonb_build_object('kind', 'opdracht', 'title', 'Alfabet achteruit')) $$;
grant execute on all functions in schema pg_temp to authenticated;
select isnt(give_homework(ensure_group((select id from ids where naam = 'sem')), 'deze', '["g4"]', 15, 5, 'Succes!', pg_temp.taken(), '{}'), null, 'Huiswerk met twee opdrachten voor Sem');
select isnt(give_homework(ensure_group((select id from ids where naam = 'noor')), 'deze', '["g4"]', 15, 5, 'Succes!', pg_temp.taken(), '{}'), null, 'en voor Noor');
select is((select count(*)::int from assignments), 4, 'Elke leerling krijgt eigen opdrachten (in zijn eigen privégroep)');
select is((select book_title || ' ' || page || ' ' || track from assignments where kind = 'stuk' limit 1), 'Saxofoon Methode 1 23 17',
  'De boektitel wordt meegegeven (de leerling mag de boekenlijst niet lezen)');
select throws_ok($$ select give_homework(ensure_group((select id from ids where naam = 'sem')), 'deze', '[]', 15, 5, '', '[{"kind":"stuk","title":""}]', '{}') $$,
  'P0001', 'ongeldige opdracht', 'Een opdracht zonder titel wordt geweigerd');
select is((select count(*)::int from assignments), 4, 'Bij een fout wordt niets opgeslagen');

-- ── Leerling ziet en vinkt af ────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'lotte'));
select is((select count(*)::int from assignments), 2, 'De leerling ziet alleen haar eigen opdrachten');
select lives_ok($$ select set_done((select h.id from homework h join assignments a on a.id = h.assignment_id where a.kind = 'opdracht'), (select id from ids where naam = 'sem'), true) $$,
  'De leerling vinkt een opdracht af');
select is((select count(*)::int from homework_done), 1, 'Afgevinkt');
select throws_ok($$ update assignments set title = 'anders' $$, '42501', null, 'De leerling verandert de opdracht niet');
select pg_temp.als((select id from ids where naam = 'olaf'));
select throws_ok($$ select set_done((select h.id from homework h limit 1), (select id from ids where naam = 'sem'), true) $$, 'P0001', 'geen toegang', 'Een vreemde vinkt niets af');

-- ── Toewijzen vanuit de bank ─────────────────────────────────────────
select pg_temp.als((select id from ids where naam = 'marieke'));
select is(assign_tasks(array[(select id from ids where naam = 'sem')], array[(select id from ids where naam = 'bank2')], current_date + 7), 1,
  'Opdracht uit de bank toegewezen aan Sem');
select is((select count(*)::int from homework h join lessons l on l.id = h.lesson_id join group_members m on m.group_id = l.group_id where m.student_id = (select id from ids where naam = 'sem')), 3,
  'Hij komt bij de lopende les van de leraar (geen nieuwe les)');

select * from finish();
rollback;
