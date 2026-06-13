-- ============================================================================
-- SWOLE OS — current training PHASE (for body-comp intelligence)
-- gain | lean | recomp | maintain. DYNAMIC — the lifter flips it per cycle in-app.
-- Drives the Apple Health body-comp reads (is this weight/lean/fat trend ON PLAN?).
-- Run in the Supabase SQL editor.
-- ============================================================================
alter table users
  add column if not exists current_phase text;
