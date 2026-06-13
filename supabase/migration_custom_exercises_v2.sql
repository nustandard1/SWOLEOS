-- SWOLE OS — user custom exercises live in the exercises table (so FKs in
-- session_exercises / template_session_exercises resolve and customs get full
-- history + intelligence). user_id NULL = global/standard; set = that user's private.

alter table public.exercises
  add column if not exists user_id uuid references public.users(id) on delete cascade;

-- Let authenticated users insert their OWN custom exercises.
-- (Policies are only enforced when RLS is enabled; harmless otherwise.)
drop policy if exists "exercises_insert_own" on public.exercises;
create policy "exercises_insert_own" on public.exercises
  for insert with check (user_id = auth.uid());

-- Optional hardening (uncomment before launch if exercises has RLS enabled with a
-- permissive select policy — keeps customs private at the API layer; the app already
-- filters to globals + own in its queries):
-- drop policy if exists "exercises_select_visible" on public.exercises;
-- create policy "exercises_select_visible" on public.exercises
--   for select using (user_id is null or user_id = auth.uid());
