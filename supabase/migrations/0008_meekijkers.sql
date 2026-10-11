-- Meekijkers: een leerling met een eigen login ziet in "Mijn profiel" wie zijn ouder (eigenaar
-- van het leerlingprofiel) en leraren zijn. Hun profielen mag hij niet lezen, dus alleen de naam
-- via deze functie. Een eigen profiel zonder ouder geeft geen ouder terug.
create or replace function public.my_guardians()
returns table (student_id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select s.id, p.display_name, 'ouder' from public.students s join public.profiles p on p.id = s.owner_id
    where s.user_id = auth.uid() and s.owner_id <> auth.uid()
  union all
  select s.id, p.display_name, 'leraar' from public.students s
    join public.teacher_students ts on ts.student_id = s.id join public.profiles p on p.id = ts.teacher_id
    where s.user_id = auth.uid();
$$;
revoke execute on function public.my_guardians() from public, anon;
grant execute on function public.my_guardians() to authenticated;
