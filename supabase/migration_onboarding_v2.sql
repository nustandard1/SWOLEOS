-- ============================================================================
-- SWOLE OS — onboarding v2 fields
--   lifter_traits : "what drives you" multi-select (intensity/volume/barbell/…)
--   lifter_style  : derived style label (HIGH INTENSITY / HIGH VOLUME / BALANCED)
--   weak_muscles  : the 2 weakest areas (also mirrored into priority_muscles to push)
-- strong_muscles already added in migration_onboarding_strong.sql.
-- Run in the Supabase SQL editor.
-- ============================================================================
alter table users
  add column if not exists lifter_traits text[],
  add column if not exists lifter_style  text,
  add column if not exists weak_muscles  text[];
