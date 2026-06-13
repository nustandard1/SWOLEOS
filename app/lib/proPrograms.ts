// @ts-nocheck
// SWOLE/OS — PRO programs (expert-built training systems).
// Authored in-app; "activating" one copies it into the user's own workout_templates
// so it drives the calendar, logger, progression engine, and Intelligence exactly
// like a template they built. Exercises are matched to the library by `lib` name.
import { supabase } from './supabase';

// rep ranges marked `double` use the app's double-progression engine (the `*` in the
// source program). `prog`: 'double' | 'straight' | 'myo_rep' | 'cluster'.
export const PRO_PROGRAMS = [
  {
    id: 'pillars_4day_ppl',
    name: 'Pillars: 4-Day PPL',
    splitType: 'ppl_4day',
    daysPerWeek: 4,
    weeks: 8,
    purpose: 'Hypertrophy',
    volume: 'Moderate',
    difficulty: 'Intermediate',
    intensity: 'Moderate',
    schedule: 'Mon · Tue · Thu · Fri',
    highlights: [
      'Push/Pull/Legs over 4 days — every muscle hit ~every 5 days.',
      'A & B versions of each day: variety without losing the overload focus.',
      'Double progression on most lifts — the app guides every jump.',
      'Built for high effort (RPE ~9). Quality over quantity.',
    ],
    sessions: [
      { name: 'Push A', exercises: [
        { name: 'Smith Incline Press', lib: 'Smith Incline Press', sets: 3, repMin: 6, repMax: 8, prog: 'double', rpe: '8-9', rest: 120, notes: 'Low incline.', swaps: 'DB low incline press, machine incline press' },
        { name: 'Seated DB Press — no lockout', lib: 'Seated DB Press', sets: 2, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 90, notes: 'No lockout at the top; 2 seconds coming down.', swaps: 'Machine press, barbell press' },
        { name: 'Cable Flyes', lib: 'Cable Flyes (Low to High)', sets: 3, repMin: 8, repMax: 12, prog: 'double', rpe: '8-9', rest: 90, notes: 'Choose the angle you want to work with.', swaps: 'Pec deck flyes, machine flyes' },
        { name: 'Lateral Raise — slow eccentric', lib: 'Eccentric DB Lateral Raise', sets: 3, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 60, notes: '4-second eccentric every rep.', swaps: 'Machine lateral raise, cable lateral raise' },
        { name: 'PJR Pullovers', lib: 'PJR Pullovers', sets: 2, repMin: 8, repMax: 12, prog: 'double', rpe: '8-9', rest: 120, notes: 'Lats initiate the move back up, then triceps take over. Big stretch.', swaps: 'Overhead triceps cable extension' },
        { name: 'Cable Triceps Rope Pushdown', lib: 'Cable Rope Pushdown', sets: 3, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 90, notes: 'Mind in the triceps. Good reps.', swaps: 'Banded triceps pushdowns' },
      ]},
      { name: 'Pull A', exercises: [
        { name: 'Narrow Grip Lat Pulldown', lib: 'Narrow Grip Lat Pulldowns', sets: 2, repMin: 10, repMax: 12, prog: 'myo_rep', rpe: '9-10', rest: 60, notes: 'Myo-rep match: get as many as you can, rest ~60s, then get that number again — resting 10–15s every time you have to stop, until you get there.', swaps: 'Pull-ups, machine lat pulldown' },
        { name: 'Machine Rows', lib: 'Machine Row', sets: 4, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 120, notes: 'Shoulder blades pulling together as you pull.', swaps: 'Barbell row, DB row, cable row' },
        { name: 'Pec Deck Reverse Flyes', lib: 'Reverse Pec Deck', sets: 3, repMin: 10, repMax: 15, prog: 'double', rpe: '8-9', rest: 90, notes: 'Drive elbows to the walls.', swaps: 'DB rear delt flyes, cable reverse flyes' },
        { name: 'Spider Curls', lib: 'Spider Curls', sets: 3, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 90, notes: 'Focus on the biceps contraction at the top.', swaps: 'Other curl variation' },
        { name: 'Incline DB Hammer Curls', lib: 'DB Incline Hammer Curls', sets: 2, repMin: 10, repMax: 12, prog: 'double', rpe: '8-9', rest: 120, notes: 'Full extension, control the way down. Suffer.', swaps: 'Other curl variation' },
        { name: 'Ab Machine Crunches', lib: 'Machine Crunches', sets: 2, repMin: 20, repMax: 20, prog: 'straight', rpe: '8', rest: 60, notes: 'Keep tension on the abs.', swaps: 'Other ab variation' },
      ]},
      { name: 'Legs A', exercises: [
        { name: 'Lying Hamstring Curl', lib: 'Lying Hamstring Curls', sets: 3, repMin: 6, repMax: 8, prog: 'double', rpe: '9', rest: 90, notes: '3 seconds coming down.', swaps: '' },
        { name: 'Squat — your variation', lib: 'Hack Squats', sets: 3, repMin: 6, repMax: 8, prog: 'double', rpe: '8', rest: null, notes: 'Choose a variation and stick with it. Rest as needed.', swaps: 'Hack squat, back squat, belt squat, leg press' },
        { name: 'DB Romanian Deadlift', lib: 'DB Romanian Deadlift', sets: 3, repMin: 7, repMax: 10, prog: 'double', rpe: '8', rest: 120, notes: 'Soft knees, push the hips back, big stretch.', swaps: 'Barbell RDL, back extension, Smith RDL' },
        { name: 'DB Walking Lunges', lib: 'DB Walking Lunges', sets: 2, repMin: 20, repMax: 20, prog: 'straight', rpe: '8', rest: 150, notes: '20 total lunges. Don’t walk a tightrope; no slamming the knee down.', swaps: 'Lunges, reverse lunges, split squat' },
        { name: 'Machine Calf Raise', lib: 'Machine Calf Raise', sets: 3, repMin: 10, repMax: 12, prog: 'straight', rpe: '8-9', rest: 90, notes: '2-second pause at the top and bottom stretch.', swaps: 'Other calf raise variation' },
      ]},
      { name: 'Push B', exercises: [
        { name: 'DB Low Incline Bench Press', lib: 'DB Low Incline Bench Press', sets: 3, repMin: 6, repMax: 8, prog: 'double', rpe: '8-9', rest: 120, notes: 'Same weight all sets; 6–8 reps close to failure.', swaps: 'Machine press, barbell bench/incline press' },
        { name: 'Dips', lib: 'Dips', sets: 3, repMin: 5, repMax: 7, prog: 'double', rpe: '8-9', rest: 120, notes: 'Don’t come down lower than feels good. Add weight if needed for 5–7.', swaps: 'Decline DB press, close-grip push-ups, assisted dips' },
        { name: 'Cable Flyes', lib: 'Cable Flyes (High to Low)', sets: 3, repMin: 8, repMax: 12, prog: 'double', rpe: '8-9', rest: 120, notes: 'Different angle than Push A. Feel the pecs.', swaps: 'Pec deck flyes' },
        { name: 'Cable Lateral Raise — cluster', lib: 'Cable Lateral Raise', sets: 1, repMin: 5, repMax: 5, prog: 'cluster', rpe: '', rest: 0, notes: 'Cluster: 5 reps right, 5 reps left, repeat for 5:00 (one side rests while the other works). Use ~your 15–20 rep-max weight. Add a rep each week — wk2: 6/6, wk3: 7/7 — up to 8:00, then switch to 4×8–12.', swaps: 'Machine lateral raise, DB lateral raise' },
        { name: 'DB Triceps Extension — slow eccentric', lib: 'Lying DB Triceps Extension', sets: 3, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 90, notes: '4-second eccentric. Upper arm stays vertical.', swaps: 'Cable overhead triceps extension, skull crushers' },
        { name: 'Single-Arm Triceps Cable Extension', lib: 'Cable Overhead Triceps Extension', sets: 2, repMin: 8, repMax: 12, prog: 'double', rpe: '8-9', rest: 120, notes: '', swaps: 'Regular cable triceps extension' },
      ]},
      { name: 'Pull B', exercises: [
        { name: 'Lat Prayers', lib: 'Lat Prayers', sets: 3, repMin: 10, repMax: 12, prog: 'double', rpe: '8-9', rest: 90, notes: 'Imagine squeezing a tennis ball in your armpit.', swaps: 'DB pullover' },
        { name: 'T-Bar Row', lib: 'T-Bar Rows', sets: 3, repMin: 6, repMax: 8, prog: 'double', rpe: '9', rest: 120, notes: 'Wide elbows; shoulder blades pulling back as you row.', swaps: 'Machine row, supported DB rows' },
        { name: 'Chin Ups', lib: 'Chin Ups', sets: 3, repMin: 5, repMax: 8, prog: 'double', rpe: '8-9', rest: 120, notes: 'Add weight if capable at 5–8 reps.', swaps: 'Reverse-grip lat pulldown' },
        { name: 'Cable Curls', lib: 'Cable Curls', sets: 3, repMin: 8, repMax: 10, prog: 'double', rpe: '9', rest: 120, notes: 'Squeeze the biceps. Mind in the biceps.', swaps: 'Barbell/EZ-bar curl, other curl variation' },
        { name: 'Reverse Curls', lib: 'Barbell Reverse Curls', sets: 2, repMin: 10, repMax: 12, prog: 'double', rpe: '8-9', rest: 90, notes: 'Add Fat Gripz if you have ’em.', swaps: 'Zottman curls, other curl variation' },
      ]},
      { name: 'Legs B', exercises: [
        { name: 'Seated Hamstring Curl', lib: 'Seated Hamstring Curl', sets: 4, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 90, notes: 'Squeeze the hamstring at the contraction.', swaps: 'Lying hamstring curls' },
        { name: 'Leg Extension', lib: 'Leg Extensions', sets: 2, repMin: 12, repMax: 15, prog: 'double', rpe: '8-9', rest: 90, notes: 'Squeeze. Suffer. Make 12–15 hard — hitting 15+? Add weight.', swaps: '' },
        { name: 'Single Leg Press', lib: 'Single Leg Press', sets: 2, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 120, notes: 'As deep as feels good; butt stays on the pad.', swaps: 'Regular leg press, squat variation' },
        { name: 'Bulgarian Split Squat', lib: 'DB Bulgarian Split Squat', sets: 2, repMin: 8, repMax: 10, prog: 'double', rpe: '8-9', rest: 120, notes: 'OK to hold a rack for support. Back foot doesn’t need to be high.', swaps: 'Reverse lunge, Smith split squat' },
        { name: 'Back Extension', lib: '45 Degree Back Extension', sets: 2, repMin: 8, repMax: 12, prog: 'straight', rpe: '8', rest: 120, notes: 'Add weight if you can.', swaps: 'RDL variation' },
        { name: 'Machine Calf Raise', lib: 'Machine Calf Raise', sets: 3, repMin: 10, repMax: 12, prog: 'straight', rpe: '8-9', rest: 120, notes: '2-second hold at the top and bottom.', swaps: 'Other calf raise variation' },
        { name: 'Hanging Leg Raise', lib: 'Hanging Leg Raise', sets: 2, repMin: 12, repMax: 15, prog: 'straight', rpe: '8', rest: 120, notes: 'Keep tension on the abs. Legs slightly out in front.', swaps: 'Other ab variation' },
      ]},
    ],
  },
];

export function getProgram(id) {
  return PRO_PROGRAMS.find(p => p.id === id) || null;
}

// "8-9" → 9, "9-10" → 10, "8" → 8, "" → null. Top of the range is the suggested target.
function rpeTarget(s) {
  if (!s) return null;
  const nums = String(s).match(/[\d.]+/g);
  if (!nums) return null;
  return parseFloat(nums[nums.length - 1]);
}

async function findExerciseId(libName) {
  // exact-ish: match the library exercise by name (global lib first, then any).
  let { data } = await supabase.from('exercises').select('id').ilike('name', libName).is('user_id', null).order('name').limit(1);
  if (data && data.length) return data[0].id;
  ({ data } = await supabase.from('exercises').select('id').ilike('name', `%${libName}%`).limit(1));
  return data && data.length ? data[0].id : null;
}

// Copy a PRO program into the user's templates and make it active. Returns {templateId} or {error}.
export async function activateProgram(userId, program) {
  if (!userId || !program) return { error: 'missing args' };
  // one active program at a time — deactivate any current one (it's saved, not deleted).
  await supabase.from('workout_templates').update({ is_active: false }).eq('user_id', userId).eq('is_active', true);

  const { data: tmpl, error: tErr } = await supabase
    .from('workout_templates')
    .insert({ user_id: userId, title: program.name, split_type: program.splitType, is_active: true, current_session_index: 0 })
    .select('id').single();
  if (tErr || !tmpl) return { error: tErr?.message || 'template create failed' };

  const missing = [];
  for (let si = 0; si < program.sessions.length; si++) {
    const sess = program.sessions[si];
    const { data: ts } = await supabase
      .from('template_sessions')
      .insert({ template_id: tmpl.id, name: sess.name, session_order: si })
      .select('id').single();
    if (!ts) continue;
    const rows = [];
    for (let ei = 0; ei < sess.exercises.length; ei++) {
      const ex = sess.exercises[ei];
      const exId = await findExerciseId(ex.lib);
      if (!exId) { missing.push(ex.lib); continue; }
      rows.push({
        template_session_id: ts.id, exercise_id: exId, exercise_order: ei,
        target_sets: ex.sets, target_rep_min: ex.repMin, target_rep_max: ex.repMax,
        target_rpe: rpeTarget(ex.rpe), notes: ex.notes || null,
        rest_seconds: ex.rest ?? null, swaps: ex.swaps || null, progression_type: ex.prog || 'straight',
      });
    }
    if (rows.length) await supabase.from('template_session_exercises').insert(rows);
  }
  return { templateId: tmpl.id, missing };
}
