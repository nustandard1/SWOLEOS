-- SWOLE/OS — DEMO TRAINING SEED
-- Generates ~8 weeks of realistic, progressive Upper/Lower training (Mon/Tue/Thu/Fri)
-- so the Training Score, trend charts, PR wall, and Insights all light up immediately.
-- Most lifts climb; Overhead Press deliberately fades (to fire a FOCUS item + a
-- "pressing is sliding" insight). Body comp still needs Apple Health on-device.
--
-- HOW TO RUN: set your email on the first line of the block below, then run the
-- whole thing in the Supabase SQL editor. (It WIPES your existing logged sessions
-- first so the demo is clean — only do this on a test account.)

DO $$
DECLARE
  v_email text := 'PUT_YOUR_EMAIL_HERE';   -- <<< set this
  v_user  uuid;
  v_monday date;
  w int; s int; i int; setn int;
  v_perf timestamptz;
  v_sess uuid; v_se uuid; v_ex uuid;
  v_w numeric;
  day_off   int[]  := array[0,1,3,4];                         -- Mon, Tue, Thu, Fri
  sess_names text[] := array['Upper A','Lower A','Upper B','Lower B'];
  slot record;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = lower(v_email);
  IF v_user IS NULL THEN RAISE EXCEPTION 'No user found for email %', v_email; END IF;

  -- clean slate (test account only)
  DELETE FROM set_logs WHERE session_exercise_id IN (
    SELECT se.id FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.workout_session_id WHERE ws.user_id = v_user);
  DELETE FROM session_exercises WHERE workout_session_id IN (SELECT id FROM workout_sessions WHERE user_id = v_user);
  DELETE FROM workout_sessions WHERE user_id = v_user;

  -- which lifts fill each session: session idx, order, name pattern, muscle, base weight,
  -- weekly increment (negative = fading), working sets, reps
  CREATE TEMP TABLE _slots (sess int, ord int, pat text, muscle text, base numeric, inc numeric, sets int, reps int) ON COMMIT DROP;
  INSERT INTO _slots VALUES
    (0,0,'%bench press%','chest',135,2.5,4,6),
    (0,1,'%row%','back',135,3,4,8),
    (0,2,'%press%','delts',105,-1.8,3,6),       -- fading press (demo regressor)
    (0,3,'%pulldown%','back',120,3,3,10),
    (0,4,'%curl%','biceps',30,0.8,3,11),
    (1,0,'%squat%','quads',185,5,4,5),
    (1,1,'%romanian%','hamstrings',155,4,3,8),
    (1,2,'%leg press%','quads',270,6,3,10),
    (1,3,'%leg curl%','hamstrings',80,2,3,11),
    (1,4,'%calf%','calves',150,3,4,12),
    (2,0,'%incline%','chest',55,1,4,9),
    (2,1,'%pulldown%','back',120,3,3,10),
    (2,2,'%lateral raise%','delts',20,0.5,4,14),
    (2,3,'%cable row%','back',130,3,3,11),
    (2,4,'%pushdown%','triceps',50,1.2,3,12),
    (3,0,'%squat%','quads',185,5,4,6),
    (3,1,'%hip thrust%','glutes',185,6,3,9),
    (3,2,'%leg extension%','quads',120,3,3,13),
    (3,3,'%leg curl%','hamstrings',80,2,3,12),
    (3,4,'%calf%','calves',150,3,4,13);

  v_monday := (date_trunc('week', now()))::date;   -- this week's Monday

  FOR w IN 0..7 LOOP                                -- week 0 = oldest, 7 = current
    FOR s IN 0..3 LOOP
      v_perf := ((v_monday - ((7 - w) * 7) + day_off[s + 1])::timestamp + time '18:00');
      CONTINUE WHEN v_perf > now();                 -- never log the future
      INSERT INTO workout_sessions (user_id, session_name, performed_at)
        VALUES (v_user, sess_names[s + 1], v_perf) RETURNING id INTO v_sess;
      i := 0;
      FOR slot IN SELECT * FROM _slots WHERE sess = s ORDER BY ord LOOP
        SELECT id INTO v_ex FROM exercises
          WHERE name ILIKE slot.pat AND primary_muscle = slot.muscle AND user_id IS NULL
          ORDER BY length(name) LIMIT 1;
        IF v_ex IS NULL THEN
          SELECT id INTO v_ex FROM exercises WHERE name ILIKE slot.pat AND user_id IS NULL ORDER BY length(name) LIMIT 1;
        END IF;
        IF v_ex IS NULL THEN CONTINUE; END IF;       -- lift not in library — skip the slot
        INSERT INTO session_exercises (workout_session_id, exercise_id, exercise_order)
          VALUES (v_sess, v_ex, i) RETURNING id INTO v_se;
        i := i + 1;
        v_w := round((slot.base + slot.inc * w) / 5) * 5;
        INSERT INTO set_logs (session_exercise_id, set_number, weight, reps, rpe, is_warmup)
          VALUES (v_se, 1, GREATEST(round(v_w * 0.6 / 5) * 5, 5), slot.reps, NULL, true);
        FOR setn IN 1..slot.sets LOOP
          INSERT INTO set_logs (session_exercise_id, set_number, weight, reps, rpe, is_warmup)
            VALUES (
              v_se, setn + 1, v_w,
              slot.reps - (CASE WHEN setn = slot.sets THEN 1 ELSE 0 END),
              CASE WHEN setn = slot.sets THEN 9 WHEN setn = slot.sets - 1 THEN 8.5 ELSE 8 END,
              false
            );
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Seeded ~8 weeks of demo training for %', v_email;
END $$;
