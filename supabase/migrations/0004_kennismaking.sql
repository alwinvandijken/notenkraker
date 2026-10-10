-- Kennismaking (AC-115): leeftijdsgroep en ervaring per leerling, en wanneer de kennismaking klaar was.
-- De uitslag van de notentoets staat gewoon in student_notes. Het notenspel leest de leeftijdsgroep
-- voor het aantal levens (6–8 jaar: 4, anders 3); zie supabase/functions/rounds.
alter table public.students
  add column age_band text check (age_band in ('6-8','9-12','13-17','18+')),
  add column experience text check (experience in ('nieuw','lt1','1-3','gt3')),
  add column onboarded_at timestamptz;
comment on column public.students.age_band is 'leeftijdsgroep; null = niet ingevuld';
comment on column public.students.experience is 'hoe lang al spelen: nieuw, lt1 (< 1 jaar), 1-3, gt3 (> 3 jaar)';
comment on column public.students.onboarded_at is 'kennismaking afgerond of overgeslagen; null = nog vragen';
