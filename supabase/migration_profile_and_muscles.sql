-- ============================================================================
--  SWOLE/OS migration: calibration profile columns + 1¼ rename + biceps/triceps
--  Run this whole block once in the Supabase SQL editor.
-- ============================================================================

-- 1. Calibration profile columns on users -----------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS goals_ranked     text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rep_preference   text,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS archetype        text,
  ADD COLUMN IF NOT EXISTS weakest_part     text,
  ADD COLUMN IF NOT EXISTS priority_muscles text[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS limiters         text[]  DEFAULT '{}';

-- 2. Fix the 1¼ exercise names (quarter-rep vs one-and-a-quarter) -----------
UPDATE public.exercises SET name = '1+1/4 Back Squat'                    WHERE name = '1/4 Back Squat';
UPDATE public.exercises SET name = '1+1/4 Hatfield Squat'               WHERE name = '1/4 Hatfield Squat';
UPDATE public.exercises SET name = 'DB 1+1/4 Rep Bulgarian Split Squat' WHERE name = 'DB 1/4 Rep Bulgarian Split Squat';
UPDATE public.exercises SET name = '1+1/4 Goblet Squats'               WHERE name = '1/4 Goblet Squats';
UPDATE public.exercises SET name = '1+1/4 DB Hammer Curls'             WHERE name = '1/4 DB Hammer Curls';
UPDATE public.exercises SET name = '1+1/4 Hip Thrust'                  WHERE name = '1/4 Hip Thrust';

-- 3. Split "arms" into biceps / triceps -------------------------------------
UPDATE public.exercises SET primary_muscle = 'biceps' WHERE primary_muscle = 'arms' AND name IN (
  '1+1/4 DB Hammer Curls','Barbell Curls','Barbell Reverse Curls','Cable Curls','Cable Rope Curls',
  'DB Hammer Curls','DB Incline Curls','DB Incline Hammer Curls','DB Preacher Curls','EZ Bar Curls',
  'Machine Biceps Curl','Machine Preacher Curls','Plate Curls','Seated Curls','Single Arm Cable Curl',
  'Spider Curls','Towel KB Curl','Zottman Curls'
);

UPDATE public.exercises SET primary_muscle = 'triceps' WHERE primary_muscle = 'arms' AND name IN (
  'Banded Triceps Pushdown','Barbell Floor Press','Cable Bar Pushdown','Cable Overhead Triceps Extension',
  'Cable Rope Pushdown','Close Grip Incline Press','Close Grip Push Up','DB Lateral Triceps Extension',
  'Dips (Triceps Focus)','Inverted Skull Crusher','JM Press','Lying DB Triceps Extension',
  'Machine Triceps Extension','PJR Pullovers','Paused DB Triceps Extension','Skull Crushers',
  'Smith Close Grip Bench Press'
);

-- Safety net: anything still 'arms' (e.g. a curl/extension we missed) ---------
UPDATE public.exercises SET primary_muscle = 'biceps'
  WHERE primary_muscle = 'arms' AND (lower(name) LIKE '%curl%');
UPDATE public.exercises SET primary_muscle = 'triceps'
  WHERE primary_muscle = 'arms';

-- Verify (optional): SELECT primary_muscle, count(*) FROM public.exercises GROUP BY 1 ORDER BY 1;
