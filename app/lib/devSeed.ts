// @ts-nocheck
// DEV-ONLY: seed synthetic exercise history so the coaching engine's states are visible
// without grinding real sessions. Inserts a few exposures per lift, each on a trajectory
// that triggers a different STATE/severity. Wipes its own prior seed first (session_name
// = 'DEV SEED'). __DEV__-gated in the UI — never reachable in a production build.
import { supabase } from './supabase';

const SEED_TAG = 'DEV SEED';

// Each trajectory is OLDEST → NEWEST; offsets place them ~3 weeks back to now.
const TRAJECTORIES = [
  { label: 'stall → HOLD',        sessions: [[185, 5, 9], [185, 5, 9], [185, 5, 9], [185, 5, 9]] },
  { label: 'progressing → ADD WEIGHT', sessions: [[215, 5, 8], [225, 5, 8], [235, 5, 8], [245, 5, 8]] },
  { label: 'slipping → BACK OFF', sessions: [[145, 8, 8], [140, 8, 8], [135, 7, 9], [130, 6, 9]] },
  { label: 'too easy → PUSH',     sessions: [[100, 10, 6], [100, 10, 6], [100, 10, 6], [100, 10, 6]] },
];
const OFFSETS = [22, 15, 8, 1]; // days ago

async function clearSeed(userId) {
  const { data: old } = await supabase.from('workout_sessions').select('id').eq('user_id', userId).eq('session_name', SEED_TAG);
  const ids = (old || []).map(o => o.id);
  if (!ids.length) return;
  const { data: ses } = await supabase.from('session_exercises').select('id').in('workout_session_id', ids);
  const seIds = (ses || []).map(s => s.id);
  if (seIds.length) await supabase.from('set_logs').delete().in('session_exercise_id', seIds);
  await supabase.from('session_exercises').delete().in('workout_session_id', ids);
  await supabase.from('workout_sessions').delete().in('id', ids);
}

async function pickExercises(userId) {
  const wanted = ['bench', 'squat', 'curl', 'lateral'];
  const picks = [];
  for (const w of wanted) {
    const { data } = await supabase
      .from('exercises').select('id, name')
      .or(`user_id.is.null,user_id.eq.${userId}`)
      .ilike('name', `%${w}%`).limit(1);
    if (data && data[0] && !picks.find(p => p.id === data[0].id)) picks.push(data[0]);
  }
  if (picks.length < 4) {
    const { data } = await supabase.from('exercises').select('id, name').is('user_id', null).order('name').limit(12);
    for (const e of (data || [])) { if (picks.length >= 4) break; if (!picks.find(p => p.id === e.id)) picks.push(e); }
  }
  return picks.slice(0, 4);
}

// Returns a per-lift summary so the caller can tell the user which lift shows which state.
export async function seedCoachData(userId) {
  if (!userId) return { error: 'no user' };
  await clearSeed(userId);
  const picks = await pickExercises(userId);
  if (!picks.length) return { error: 'no exercises found to seed' };

  const summary = [];
  for (let p = 0; p < picks.length; p++) {
    const traj = TRAJECTORIES[p % TRAJECTORIES.length];
    for (let k = 0; k < traj.sessions.length; k++) {
      const [w, r, rpe] = traj.sessions[k];
      const performed_at = new Date(Date.now() - OFFSETS[k] * 86400000).toISOString();
      const { data: sess } = await supabase
        .from('workout_sessions')
        .insert({ user_id: userId, session_name: SEED_TAG, performed_at })
        .select().single();
      if (!sess) continue;
      const { data: se } = await supabase
        .from('session_exercises')
        .insert({ workout_session_id: sess.id, exercise_id: picks[p].id, exercise_order: 0 })
        .select().single();
      if (!se) continue;
      const rows = [1, 2, 3].map(n => ({
        session_exercise_id: se.id, set_number: n, weight: w, reps: r, rpe, is_warmup: false, cluster_reps: null,
      }));
      await supabase.from('set_logs').insert(rows);
    }
    summary.push(`${picks[p].name} — ${traj.label}`);
  }
  return { summary };
}

export async function clearCoachSeed(userId) {
  if (!userId) return;
  await clearSeed(userId);
}
