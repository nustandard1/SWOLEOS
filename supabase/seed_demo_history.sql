-- ============================================================================
-- SWOLE OS — realistic 4-week demo history (to see the Intelligence grades behave)
-- Run in the Supabase SQL editor. SAFE + REPEATABLE: it only inserts, and it only
-- deletes the rows it previously inserted (sessions tagged notes = 'SEED_DEMO').
--
-- It logs a 4-day Upper/Lower split (Mon/Tue/Thu/Fri) for the last 4 COMPLETED
-- weeks, with real progressive overload week over week — so progression (and thus
-- Strength/Growth), planned-vs-actual Consistency, and Recovery all light up the way
-- they would for a real lifter.
-- ============================================================================
do $$
declare
  v_user uuid;
  v_ex   uuid;
  v_sess uuid;
  v_se   uuid;
  dr record;          -- distinct training day
  pr record;          -- a planned exercise on that day
  wk  int;            -- weeks ago (4 = oldest … 1 = last week)
  w   numeric;
  i   int;
  monday date;
  sess_ts timestamptz;
begin
  -- 1) Your user. Single-user test DB → picks the first user. To target a specific
  --    account instead, comment the SELECT and set: v_user := 'YOUR-USER-UUID';
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then raise exception 'No user found in auth.users'; end if;

  -- 2) Repeatable: clear any prior demo seed (does NOT touch your real sessions).
  delete from workout_sessions where user_id = v_user and notes = 'SEED_DEMO';

  -- 3) The plan. dow: 0=Mon, 1=Tue, 3=Thu, 4=Fri. Uncertain names use %patterns%
  --    and are skipped if your library doesn't have a match.
  create temp table tmp_plan(dow int, ord int, ex_name text, base numeric, inc numeric, reps int, nsets int, rpe numeric) on commit drop;
  insert into tmp_plan values
    (0,1,'Barbell Bench Press',            135, 5,   6, 3, 8),
    (0,2,'Machine Lat Pulldowns',          120, 5,  10, 3, 8),
    (0,3,'Barbell Overhead Press',          75, 5,   8, 3, 8),
    (0,4,'Barbell Curls',                   60, 2.5,10, 3, 8),
    (1,1,'Barbell Back Squat',             185, 5,   5, 3, 8),
    (1,2,'Barbell Romanian Deadlift',      155, 5,   8, 3, 7.5),
    (1,3,'Leg Extensions',                 110, 5,  12, 3, 8.5),
    (1,4,'%calf raise%',                   150, 5,  12, 3, 8),
    (3,1,'Low Incline Barbell Bench Press',115, 5,   8, 3, 8),
    (3,2,'%cable row%',                    130, 5,  10, 3, 8),
    (3,3,'Machine Lateral Raise',           50, 2.5,15, 3, 8.5),
    (3,4,'%pushdown%',                      60, 2.5,12, 3, 8),
    (4,1,'Leg Press',                      270,10,  10, 3, 8),
    (4,2,'%leg curl%',                      90, 5,  10, 3, 8.5),
    (4,3,'Leg Extensions',                 110, 5,  12, 3, 8.5),
    (4,4,'DB Lateral Raise',                20, 2.5,15, 3, 8);

  -- 4) Build 4 completed weeks of training (Mon/Tue/Thu/Fri), progressing each week.
  for wk in reverse 4..1 loop
    monday := (date_trunc('week', now())::date - (wk * 7));   -- Postgres week starts Monday
    for dr in select distinct dow from tmp_plan order by dow loop
      sess_ts := (monday + dr.dow)::timestamp + time '18:00';
      insert into workout_sessions(user_id, session_name, performed_at, notes)
        values (v_user,
                case dr.dow when 0 then 'Upper A' when 1 then 'Lower A' when 3 then 'Upper B' else 'Lower B' end,
                sess_ts, 'SEED_DEMO')
        returning id into v_sess;
      for pr in select * from tmp_plan where dow = dr.dow order by ord loop
        select id into v_ex from exercises
          where name ilike pr.ex_name and user_id is null
          order by length(name) limit 1;
        if v_ex is null then continue; end if;     -- name not in library → skip
        insert into session_exercises(workout_session_id, exercise_id, exercise_order)
          values (v_sess, v_ex, pr.ord) returning id into v_se;
        w := pr.base + (4 - wk) * pr.inc;          -- heavier each week = real overload
        for i in 1..pr.nsets loop
          insert into set_logs(session_exercise_id, set_number, weight, reps, rpe, is_warmup)
            values (v_se, i, w, pr.reps, pr.rpe, false);
        end loop;
      end loop;
    end loop;
  end loop;

  -- 5) Make planned-vs-actual Consistency light up: backdate your ACTIVE template so the
  --    program window covers these 4 weeks (sessions already land on its default
  --    Mon/Tue/Thu/Fri). Harmless if you have no active template.
  update workout_templates set created_at = (now() - interval '40 days')
    where user_id = v_user and is_active = true;

  raise notice 'Seeded 4 weeks of demo history for user %', v_user;
end $$;

-- To remove the demo later:
--   delete from workout_sessions where notes = 'SEED_DEMO';
