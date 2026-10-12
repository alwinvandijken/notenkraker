-- Opdrachten in het huiswerk (AC-118 stap 1a, mock-up docs/mockups/Huiswerk-Opdrachten.html).
-- Een leraar (of ouder) heeft een eigen boekenlijst en een eigen opdrachtenbank met categorieën.
-- Huiswerk krijgt opdrachten: "stuk" (spelen, met boek en verwijzing: bladzijde, hoofdstuk,
-- nummer, track) of "opdracht" (vrije tekst, de leerling vinkt af). Opdrachten worden bij het geven
-- gekopieerd, met de boektitel erbij: later wijzigen in de bank of boekenlijst verandert gegeven
-- huiswerk niet, en de leerling hoeft de boekenlijst van de leraar niet te kunnen lezen.
-- Opnames en uploads volgen in stap 1b.

create table public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  author text not null default '',
  has_audio boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.books (owner_id, title);
alter table public.books enable row level security;
create policy "eigen boeken lezen" on public.books for select using (owner_id = auth.uid());
create policy "boek toevoegen" on public.books for insert with check (owner_id = auth.uid() and public.my_role() in ('ouder','leraar'));
create policy "boek wijzigen" on public.books for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "boek verwijderen" on public.books for delete using (owner_id = auth.uid());

create table public.task_bank (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('stuk','opdracht')),
  title text not null check (length(trim(title)) between 1 and 300),
  book_id uuid references public.books (id) on delete set null,
  page text not null default '',
  chapter text not null default '',
  number text not null default '',
  track text not null default '',
  categories text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.task_bank (owner_id, title);
alter table public.task_bank enable row level security;
create policy "eigen opdrachten lezen" on public.task_bank for select using (owner_id = auth.uid());
create policy "opdracht bewaren" on public.task_bank for insert with check (owner_id = auth.uid() and public.my_role() in ('ouder','leraar'));
create policy "opdracht wijzigen" on public.task_bank for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "opdracht verwijderen" on public.task_bank for delete using (owner_id = auth.uid());

create table public.homework_tasks (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homework (id) on delete cascade,
  position integer not null default 0,
  kind text not null check (kind in ('stuk','opdracht')),
  title text not null,
  book_title text not null default '',
  book_author text not null default '',
  page text not null default '',
  chapter text not null default '',
  number text not null default '',
  track text not null default '',
  bank_id uuid references public.task_bank (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.homework_tasks (homework_id, position);
alter table public.homework_tasks enable row level security;
create policy "opdrachten lezen" on public.homework_tasks for select using (
  exists (select 1 from public.homework h where h.id = homework_id and (public.can_access_student(h.student_id) or public.is_admin()))
);
-- schrijven via de functies hieronder
revoke insert, update, delete on public.homework_tasks from anon, authenticated;

-- sjablonen bewaren voortaan ook de opdrachten (als lijst, zelfde vorm als p_tasks hieronder)
alter table public.homework_templates add column tasks jsonb not null default '[]' check (jsonb_typeof(tasks) = 'array');

-- opdrachten (jsonb-lijst) bij één huiswerk zetten; boek alleen uit de eigen boekenlijst
create or replace function public.add_homework_tasks(p_homework uuid, p_tasks jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t jsonb; b public.books; pos integer;
begin
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 30 then raise exception 'ongeldige opdracht'; end if;
  select coalesce(max(position) + 1, 0) into pos from public.homework_tasks where homework_id = p_homework;
  for t in select * from jsonb_array_elements(p_tasks) loop
    if coalesce(t->>'kind', '') not in ('stuk','opdracht') or length(trim(coalesce(t->>'title', ''))) = 0 then raise exception 'ongeldige opdracht'; end if;
    b := null;
    if t->>'book_id' is not null then select * into b from public.books where id = (t->>'book_id')::uuid and owner_id = auth.uid(); end if;
    insert into public.homework_tasks (homework_id, position, kind, title, book_title, book_author, page, chapter, number, track, bank_id)
    values (p_homework, pos, t->>'kind', left(trim(t->>'title'), 300), coalesce(b.title, ''), coalesce(b.author, ''),
            left(coalesce(t->>'page', ''), 20), left(coalesce(t->>'chapter', ''), 40), left(coalesce(t->>'number', ''), 20), left(coalesce(t->>'track', ''), 20),
            (select id from public.task_bank where id = nullif(t->>'bank_id', '')::uuid and owner_id = auth.uid()));
    pos := pos + 1;
  end loop;
end $$;
revoke execute on function public.add_homework_tasks(uuid, jsonb) from public, anon, authenticated;

-- huiswerk met opdrachten voor één of meer leerlingen; alles of niets
create or replace function public.give_homework_with_tasks(
  p_students uuid[], p_notes jsonb, p_minutes integer, p_days integer, p_remark text, p_due date, p_tasks jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare sid uuid; h public.homework; n integer := 0;
begin
  if p_students is null or cardinality(p_students) = 0 or cardinality(p_students) > 200 then raise exception 'ongeldig huiswerk'; end if;
  foreach sid in array p_students loop
    h := public.give_homework(sid, p_notes, p_minutes, p_days, '', '', p_remark, p_due);
    perform public.add_homework_tasks(h.id, coalesce(p_tasks, '[]'));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.give_homework_with_tasks(uuid[], jsonb, integer, integer, text, date, jsonb) from public, anon;
grant execute on function public.give_homework_with_tasks(uuid[], jsonb, integer, integer, text, date, jsonb) to authenticated;

-- opdrachten uit de eigen bank toewijzen: bij het lopende huiswerk van mij, of nieuw huiswerk (15 min, 5 dagen)
create or replace function public.assign_tasks(p_students uuid[], p_bank_ids uuid[], p_due date)
returns integer language plpgsql security definer set search_path = public as $$
declare sid uuid; hid uuid; tasks jsonb; n integer := 0;
begin
  if p_students is null or cardinality(p_students) = 0 or p_bank_ids is null or cardinality(p_bank_ids) = 0 then raise exception 'ongeldig huiswerk'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'title', title, 'book_id', book_id, 'page', page, 'chapter', chapter,
                                               'number', number, 'track', track, 'bank_id', id) order by array_position(p_bank_ids, id)), '[]')
    into tasks from public.task_bank where id = any (p_bank_ids) and owner_id = auth.uid();
  if jsonb_array_length(tasks) = 0 then raise exception 'geen toegang'; end if;
  foreach sid in array p_students loop
    select id into hid from public.homework
      where student_id = sid and given_by = auth.uid() and due_date >= current_date order by created_at desc limit 1;
    if hid is null then
      hid := (public.give_homework(sid, '[]', 15, 5, '', '', '', coalesce(p_due, current_date + 7))).id;
    elsif not (public.can_access_student(sid)) then
      raise exception 'geen toegang';
    end if;
    perform public.add_homework_tasks(hid, tasks);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.assign_tasks(uuid[], uuid[], date) from public, anon;
grant execute on function public.assign_tasks(uuid[], uuid[], date) to authenticated;

-- afvinken: wie bij de leerling mag (de leerling zelf, de ouder, een leraar)
create or replace function public.set_task_done(p_task uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select h.student_id into sid from public.homework_tasks t join public.homework h on h.id = t.homework_id where t.id = p_task;
  if sid is null or not public.can_access_student(sid) then raise exception 'geen toegang'; end if;
  update public.homework_tasks set done_at = case when p_done then now() end where id = p_task;
end $$;
revoke execute on function public.set_task_done(uuid, boolean) from public, anon;
grant execute on function public.set_task_done(uuid, boolean) to authenticated;
