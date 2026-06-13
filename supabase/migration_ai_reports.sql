-- SWOLE OS — AI report cache
-- Stores the Claude-written weekly narrative so we generate it once per user per
-- week, not on every screen open. period_key is the Monday ISO date of the week
-- (e.g. '2026-06-01') so each calendar week has exactly one row per user/type.

create table if not exists ai_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'weekly',         -- 'weekly' | 'monthly'
  period_key text not null,                     -- Monday-of-week ISO date
  narrative text not null,
  created_at timestamptz not null default now(),
  unique (user_id, type, period_key)
);

alter table ai_reports enable row level security;

-- Users can read and write only their own reports.
drop policy if exists "ai_reports_select_own" on ai_reports;
create policy "ai_reports_select_own" on ai_reports
  for select using (auth.uid() = user_id);

drop policy if exists "ai_reports_insert_own" on ai_reports;
create policy "ai_reports_insert_own" on ai_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "ai_reports_update_own" on ai_reports;
create policy "ai_reports_update_own" on ai_reports
  for update using (auth.uid() = user_id);
