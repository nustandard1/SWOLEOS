import { supabase } from './supabase';

export interface SetData {
  set_number: number;
  weight: number | null;
  reps: number;
  rpe: number | null;
}

export interface ExerciseHistory {
  date: string;
  sets: SetData[];
  total_volume: number;
  total_reps: number;
}

export interface ProgressionTargets {
  add_reps: { sets: SetData[]; label: string };
  add_load: { sets: SetData[]; label: string };
  add_set: { sets: SetData[]; label: string };
}

// Fetch the last session's data for a given exercise for a user
export async function getLastSession(
  userId: string,
  exerciseId: string
): Promise<ExerciseHistory | null> {
  const { data, error } = await supabase
    .from('session_exercises')
    .select(`
      id,
      workout_sessions!inner(user_id, performed_at),
      set_logs(set_number, weight, reps, rpe, is_warmup)
    `)
    .eq('exercise_id', exerciseId)
    .eq('workout_sessions.user_id', userId)
    .order('workout_sessions(performed_at)', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  const workingSets = (data.set_logs as SetData[]).filter(
    (s: any) => !s.is_warmup
  );

  const total_volume = workingSets.reduce(
    (sum, s) => sum + (s.weight || 0) * s.reps,
    0
  );

  const total_reps = workingSets.reduce((sum, s) => sum + s.reps, 0);

  return {
    date: (data.workout_sessions as any).performed_at,
    sets: workingSets,
    total_volume,
    total_reps,
  };
}

// Generate 3 potential progression targets from last session
export function getProgressionTargets(
  lastSets: SetData[]
): ProgressionTargets | null {
  if (!lastSets || lastSets.length === 0) return null;

  const workingSets = lastSets.filter(s => s.weight !== null && s.weight > 0);
  if (workingSets.length === 0) return null;

  const bestSet = [...workingSets].sort(
    (a, b) => (b.weight || 0) * b.reps - (a.weight || 0) * a.reps
  )[0];

  const weight = bestSet.weight || 0;
  const reps = bestSet.reps;
  const setCount = workingSets.length;

  // Round weight increment to nearest 2.5
  const increment = weight >= 100 ? 5 : 2.5;

  return {
    add_reps: {
      label: `Add a rep → ${setCount} × ${reps + 1} @ ${weight}lbs`,
      sets: workingSets.map(s => ({ ...s, reps: s.reps + 1 })),
    },
    add_load: {
      label: `Add load → ${setCount} × ${reps} @ ${weight + increment}lbs`,
      sets: workingSets.map(s => ({ ...s, weight: (s.weight || 0) + increment })),
    },
    add_set: {
      label: `Add a set → ${setCount + 1} × ${reps} @ ${weight}lbs`,
      sets: [...workingSets, { ...workingSets[workingSets.length - 1] }],
    },
  };
}

// Format a date for display
export function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
