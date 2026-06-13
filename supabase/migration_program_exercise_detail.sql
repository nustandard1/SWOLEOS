-- SWOLE/OS — richer exercise prescription (for PRO programs + user templates)
-- PRO programs carry a prescribed rest period, swap alternatives, and a progression
-- type (double / straight / myo-rep / cluster). These ride on the existing template
-- rows so an activated PRO program drives the logger exactly like a user template.

ALTER TABLE template_session_exercises
  ADD COLUMN IF NOT EXISTS rest_seconds    integer,
  ADD COLUMN IF NOT EXISTS swaps           text,
  ADD COLUMN IF NOT EXISTS progression_type text;   -- 'double' | 'straight' | 'myo_rep' | 'cluster'
