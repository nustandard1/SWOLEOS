-- ============================================================================
-- SWOLE OS — post-session check-in fields
-- Captures three subjective signals when a lifter finishes a session:
--   session_rpe : how hard the session felt        (1–10)
--   soreness    : soreness level today             (1–5, 5 = most sore)
--   readiness   : how they felt coming in           (1–5, 5 = primed)
-- All nullable (the check-in is optional / skippable).
-- NOTE: collected now; NOT yet wired into the grade engine (kept out so the
-- current 2-week soak stays a clean test). Run in the Supabase SQL editor.
-- ============================================================================
alter table workout_sessions
  add column if not exists session_rpe smallint,
  add column if not exists soreness    smallint,
  add column if not exists readiness   smallint;
