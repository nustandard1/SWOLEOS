-- SWOLE OS — optional day-of-week scheduling for template sessions.
-- Lets a user plot their template by weekday (Upper A → Mon, Lower A → Tue...).
-- 0 = Monday … 6 = Sunday. NULL = unscheduled (rotation/manual). One session per day.

alter table public.template_sessions
  add column if not exists scheduled_dow integer;
