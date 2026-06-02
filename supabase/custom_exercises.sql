-- Custom exercises per user
create table if not exists public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  primary_muscle text not null,
  created_at timestamptz default now()
);

alter table public.custom_exercises enable row level security;

create policy "Users can manage their own custom exercises"
  on public.custom_exercises
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
