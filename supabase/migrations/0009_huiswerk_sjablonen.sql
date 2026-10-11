-- Huiswerk voor meerdere leerlingen en sjablonen (AC-117, mock-up docs/mockups/Leraar-Desktop.html).
-- give_homework_many geeft dezelfde opgave aan meerdere leerlingen, elk een eigen rij; mag je één
-- van die leerlingen geen huiswerk geven, dan gebeurt er niets (alles of niets).
-- Sjablonen zijn eigen opgaven van een leraar of ouder om te hergebruiken; alleen de eigenaar ziet ze.

create or replace function public.give_homework_many(
  p_students uuid[], p_notes jsonb, p_minutes integer, p_days integer,
  p_piece text, p_piece_note text, p_remark text, p_due date
) returns integer language plpgsql security definer set search_path = public as $$
declare sid uuid; n integer := 0;
begin
  if p_students is null or cardinality(p_students) = 0 or cardinality(p_students) > 200 then raise exception 'ongeldig huiswerk'; end if;
  foreach sid in array p_students loop
    perform public.give_homework(sid, p_notes, p_minutes, p_days, p_piece, p_piece_note, p_remark, p_due);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.give_homework_many(uuid[], jsonb, integer, integer, text, text, text, date) from public, anon;
grant execute on function public.give_homework_many(uuid[], jsonb, integer, integer, text, text, text, date) to authenticated;

create table public.homework_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  notes jsonb not null default '[]' check (jsonb_typeof(notes) = 'array'),
  minutes_per_day integer not null check (minutes_per_day between 1 and 180),
  days_per_week integer not null check (days_per_week between 1 and 7),
  piece text not null default '',
  piece_note text not null default '',
  remark text not null default '',
  created_at timestamptz not null default now()
);
create index on public.homework_templates (owner_id, name);

alter table public.homework_templates enable row level security;
create policy "eigen sjablonen lezen" on public.homework_templates for select using (owner_id = auth.uid());
create policy "sjabloon bewaren" on public.homework_templates for insert
  with check (owner_id = auth.uid() and public.my_role() in ('ouder','leraar'));
create policy "sjabloon wijzigen" on public.homework_templates for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sjabloon verwijderen" on public.homework_templates for delete using (owner_id = auth.uid());
