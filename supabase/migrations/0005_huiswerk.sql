-- Huiswerk (AC-113, mock-up docs/mockups/Leraar-Huiswerk.html)
-- Een ouder (eigenaar van het leerlingprofiel) of een gekoppelde leraar geeft huiswerk: noten, een
-- oefendoel (minuten per dag, dagen per week), een stuk of oefening, een opmerking en een einddatum.
-- Leraar en ouder geven elk hun eigen huiswerk; per gever telt de nieuwste opgave, oudere blijven als
-- geschiedenis staan. Niemand wijzigt het huiswerk van een ander. Naam en rol van de gever worden
-- bewaard, want een leerling mag de profielen van ouder en leraar niet lezen.

create table public.homework (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  given_by uuid not null references auth.users (id) on delete cascade,
  given_by_role text not null check (given_by_role in ('ouder','leraar')),
  given_by_name text not null,
  created_at timestamptz not null default now(),
  due_date date not null,
  minutes_per_day integer not null check (minutes_per_day between 1 and 180),
  days_per_week integer not null check (days_per_week between 1 and 7),
  notes jsonb not null default '[]',
  piece text not null default '',
  piece_note text not null default '',
  remark text not null default ''
);
create index on public.homework (student_id, created_at desc);

alter table public.homework enable row level security;
create policy "huiswerk lezen" on public.homework for select
  using (public.can_access_student(student_id) or public.is_admin());
-- schrijven alleen via give_homework
revoke insert, update, delete on public.homework from anon, authenticated;

create or replace function public.give_homework(
  p_student uuid, p_notes jsonb, p_minutes integer, p_days integer,
  p_piece text, p_piece_note text, p_remark text, p_due date
) returns public.homework language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  s public.students;
  h public.homework;
  is_owner boolean;
  is_teacher boolean;
begin
  select * into me from public.profiles where id = auth.uid();
  select * into s from public.students where id = p_student;
  if me.id is null or s.id is null then raise exception 'geen toegang'; end if;
  is_owner := s.owner_id = me.id and me.role in ('ouder','leraar');
  is_teacher := me.role = 'leraar' and exists (select 1 from public.teacher_students where teacher_id = me.id and student_id = s.id);
  if not (is_owner or is_teacher) then raise exception 'geen toegang'; end if;

  if p_minutes is null or p_minutes not between 1 and 180 or p_days is null or p_days not between 1 and 7
     or p_due is null or p_due < current_date or jsonb_typeof(p_notes) <> 'array' or jsonb_array_length(p_notes) > 40
     or exists (select 1 from jsonb_array_elements(p_notes) n where jsonb_typeof(n) <> 'string')
  then raise exception 'ongeldig huiswerk'; end if;

  insert into public.homework (student_id, given_by, given_by_role, given_by_name, due_date, minutes_per_day, days_per_week, notes, piece, piece_note, remark)
  values (s.id, me.id, me.role, me.display_name, p_due, p_minutes, p_days, p_notes,
          left(coalesce(p_piece, ''), 200), left(coalesce(p_piece_note, ''), 500), left(coalesce(p_remark, ''), 1000))
  returning * into h;

  -- de noten van het huiswerk komen op "in de les" (en dus vaker in het spel); wat het kind al kent blijft staan
  insert into public.student_notes (student_id, note_id, status)
    select s.id, n, 'les' from jsonb_array_elements_text(p_notes) n
  on conflict (student_id, note_id) do update set status = 'les', updated_at = now()
    where public.student_notes.status <> 'kent';
  return h;
end $$;
revoke execute on function public.give_homework(uuid, jsonb, integer, integer, text, text, text, date) from public, anon;
grant execute on function public.give_homework(uuid, jsonb, integer, integer, text, text, text, date) to authenticated;
