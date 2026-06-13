-- ============================================================================
-- SWOLE OS — onboarding: "strong muscle groups"
-- Captured in calibration so the intelligence can dial BACK over-trained strong
-- points and redirect effort to weak/lagging ones (Mike's redirect logic).
-- Mirrors the existing priority_muscles / weakest_part fields. Run in SQL editor.
-- ============================================================================
alter table users
  add column if not exists strong_muscles text[];
