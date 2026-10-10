-- Vrij oefenen met de oefentimer (AC-112)
-- De server legt start en einde vast met zijn eigen klok; de app stuurt alleen wat hij
-- daartussen hoorde: per minuut de gespeelde seconden en de noten. De server controleert
-- dat dit kan (niet meer gespeeld dan er tijd verstreken is) en geeft het label.
-- De app werkt de sessie tijdens het oefenen elke halve minuut bij. Valt de app weg, dan
-- eindigt de sessie bij de laatste update.

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now(),
  done boolean not null default false,
  played_seconds integer not null default 0,
  -- [{ "s": 42, "notes": ["g4","a4"] }, …] één element per minuut sinds de start
  minutes jsonb not null default '[]',
  notes jsonb not null default '[]',
  -- 'twijfel': lang gespeeld maar steeds dezelfde noot
  label text not null default 'sax' check (label in ('sax','twijfel'))
);
create index on public.practice_sessions (student_id, started_at desc);

alter table public.practice_sessions enable row level security;
create policy "oefensessies lezen" on public.practice_sessions for select
  using (public.can_access_student(student_id) or public.is_admin());
-- schrijven alleen via de functies hieronder
revoke insert, update, delete on public.practice_sessions from anon, authenticated;

-- Langste sessie en meeste oefentijd per dag
create or replace function public.practice_max_seconds() returns integer language sql immutable as $$ select 3 * 3600 $$;

create or replace function public.practice_start(p_student uuid)
returns public.practice_sessions language plpgsql security definer set search_path = public as $$
declare s public.practice_sessions; today integer;
begin
  if auth.uid() is null or not public.can_access_student(p_student) then raise exception 'geen toegang'; end if;
  select coalesce(sum(played_seconds), 0) into today from public.practice_sessions
    where student_id = p_student and started_at >= date_trunc('day', now());
  if today >= public.practice_max_seconds() then raise exception 'vandaag al 3 uur geoefend'; end if;
  -- een vorige sessie die nooit is afgesloten, eindigt bij zijn laatste update
  update public.practice_sessions set done = true where student_id = p_student and not done;
  insert into public.practice_sessions (student_id) values (p_student) returning * into s;
  return s;
end $$;

create or replace function public.practice_update(p_id uuid, p_minutes jsonb, p_notes jsonb, p_done boolean default false)
returns public.practice_sessions language plpgsql security definer set search_path = public as $$
declare
  s public.practice_sessions;
  elapsed integer;
  played integer;
  over boolean;
begin
  select * into s from public.practice_sessions where id = p_id for update;
  if s.id is null or not public.can_access_student(s.student_id) then raise exception 'geen toegang'; end if;
  if s.done then raise exception 'sessie is al afgesloten'; end if;

  elapsed := floor(extract(epoch from now() - s.started_at));
  over := elapsed >= public.practice_max_seconds();
  elapsed := least(elapsed, public.practice_max_seconds());

  if jsonb_typeof(p_minutes) <> 'array' or jsonb_typeof(p_notes) <> 'array' then raise exception 'ongeldige sessie'; end if;
  if jsonb_array_length(p_minutes) > elapsed / 60 + 1 then raise exception 'meer minuten dan er verstreken zijn'; end if;
  if jsonb_array_length(p_notes) > 100 then raise exception 'ongeldige sessie'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_minutes) m
    where jsonb_typeof(m->'s') <> 'number' or (m->>'s')::numeric not between 0 and 60
  ) then raise exception 'ongeldige minuut'; end if;

  select least(coalesce(sum((m->>'s')::integer), 0), elapsed) into played from jsonb_array_elements(p_minutes) m;

  update public.practice_sessions set
    ended_at = least(now(), started_at + make_interval(secs => public.practice_max_seconds())),
    done = p_done or over,
    played_seconds = played,
    minutes = p_minutes,
    notes = p_notes,
    label = case when played >= 120 and jsonb_array_length(p_notes) <= 1 then 'twijfel' else 'sax' end
  where id = p_id returning * into s;
  return s;
end $$;

revoke execute on function public.practice_start(uuid) from public, anon;
revoke execute on function public.practice_update(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.practice_start(uuid) to authenticated;
grant execute on function public.practice_update(uuid, jsonb, jsonb, boolean) to authenticated;
