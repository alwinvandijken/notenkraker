-- Notenkraker: basisschema
-- Rollen: 'leerling' (speelt, eigen voortgang) en 'leraar' (beheert leerlingen, ziet voortgang).
-- Een ouder die thuis beheert logt in als leraar.

create extension if not exists pgcrypto;

-- Profiel per auth-gebruiker; aangemaakt door trigger bij signup.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('leerling','leraar')) default 'leerling',
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'leerling'),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  -- een leerling-account krijgt meteen een eigen leerlingprofiel
  if coalesce(new.raw_user_meta_data->>'role', 'leerling') = 'leerling' then
    insert into public.students (user_id, owner_id, name, instrument_id)
    values (new.id, new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'altsax');
  end if;
  return new;
end $$;

-- Leerling: eigenaar is de leraar/ouder die hem aanmaakte, of de leerling zelf.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null,
  instrument_id text not null default 'altsax',
  naming text not null default 'nl' check (naming in ('nl','en')),
  created_at timestamptz not null default now()
);
create index on public.students (owner_id);
create index on public.students (user_id);

-- Koppeling leraar ↔ leerling (meerdere leraren per leerling mogelijk)
create table public.teacher_students (
  teacher_id uuid not null references auth.users (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, student_id)
);

-- Uitnodigingscodes waarmee een leraar een leerling koppelt
create table public.invite_codes (
  code text primary key,
  student_id uuid not null references public.students (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days'
);

-- Junction leerling ↔ noot
create table public.student_notes (
  student_id uuid not null references public.students (id) on delete cascade,
  note_id text not null,
  status text not null check (status in ('kent','les','moet')),
  updated_at timestamptz not null default now(),
  primary key (student_id, note_id)
);

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  mode text not null check (mode in ('buttons','mic')),
  played_at timestamptz not null default now(),
  ms integer not null,
  answers jsonb not null,
  completed boolean not null,
  mistakes integer not null,
  stars smallint not null check (stars between 0 and 3),
  xp integer not null,
  wrong_notes jsonb not null default '[]'
);
create index on public.rounds (student_id, played_at desc);

create table public.songs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  title text not null,
  instrument_id text not null,
  source text not null check (source in ('manual','chat','omr')),
  notes jsonb not null,
  created_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  played_at timestamptz not null default now(),
  ms integer not null,
  correct_idx jsonb not null default '[]',
  wrong_idx jsonb not null default '[]'
);

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Toegang: wie mag bij welke leerling?
create or replace function public.can_access_student(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = sid and (s.owner_id = auth.uid() or s.user_id = auth.uid())
  ) or exists (
    select 1 from public.teacher_students ts where ts.student_id = sid and ts.teacher_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.teacher_students enable row level security;
alter table public.invite_codes enable row level security;
alter table public.student_notes enable row level security;
alter table public.rounds enable row level security;
alter table public.songs enable row level security;
alter table public.attempts enable row level security;

create policy "eigen profiel" on public.profiles for select using (id = auth.uid());
create policy "eigen profiel bijwerken" on public.profiles for update using (id = auth.uid());

create policy "leerlingen lezen" on public.students for select using (public.can_access_student(id));
create policy "leerlingen aanmaken" on public.students for insert with check (owner_id = auth.uid());
create policy "leerlingen bijwerken" on public.students for update using (public.can_access_student(id));
create policy "leerlingen verwijderen" on public.students for delete using (owner_id = auth.uid());

create policy "koppelingen lezen" on public.teacher_students for select using (teacher_id = auth.uid() or public.can_access_student(student_id));
create policy "koppeling verwijderen" on public.teacher_students for delete using (teacher_id = auth.uid());

create policy "noten" on public.student_notes for all using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
create policy "rondes lezen" on public.rounds for select using (public.can_access_student(student_id));
create policy "liedjes" on public.songs for all using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
create policy "pogingen" on public.attempts for all using (public.can_access_student(student_id)) with check (public.can_access_student(student_id));
-- rounds insert en invite_codes/teacher_students insert gebeuren via Edge Functions (service role)

alter publication supabase_realtime add table public.student_notes;
