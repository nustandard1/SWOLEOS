export type TrainingGoal =
  | 'build_muscle'
  | 'get_stronger'
  | 'hybrid_tactical'
  | 'fat_loss'
  | 'general_fitness';

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'delts'
  | 'arms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'triceps'
  | 'biceps'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'traps'
  | 'abs';

export type MovementPattern =
  | 'horizontal_press'
  | 'vertical_press'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'isolation'
  | 'carry'
  | 'core';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'kettlebell'
  | 'bands'
  | 'smith_machine';

export type SubscriptionTier = 'free' | 'premium';

// --- Users ---

export interface User {
  id: string;
  email: string;
  name: string;
  goal: TrainingGoal;
  training_days_per_week: number;
  tier: SubscriptionTier;
  created_at: string;
}

export interface UserPriorityMuscle {
  id: string;
  user_id: string;
  muscle_group: MuscleGroup;
}

// --- Exercise Database ---

export interface Exercise {
  id: string;
  name: string;
  primary_muscle: MuscleGroup;
  movement_pattern: MovementPattern;
  equipment: Equipment;
  progression_eligible: boolean;
  suggested_rep_min: number;
  suggested_rep_max: number;
}

export interface ExerciseMuscleAllocation {
  id: string;
  exercise_id: string;
  muscle_group: MuscleGroup;
  allocation_percentage: number;
}

// --- Workout Templates ---

export interface WorkoutTemplate {
  id: string;
  user_id: string;
  title: string;
  split_type: string;
  created_at: string;
}

export interface TemplateExercise {
  id: string;
  template_id: string;
  exercise_id: string;
  exercise_order: number;
  target_sets: number;
  target_rep_min: number;
  target_rep_max: number;
  target_rpe?: number;
}

// --- Workout Sessions (actual logged workouts) ---

export interface WorkoutSession {
  id: string;
  user_id: string;
  template_id?: string;
  session_name: string;
  performed_at: string;
  notes?: string;
}

export interface SessionExercise {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  exercise_order: number;
}

export interface SetLog {
  id: string;
  session_exercise_id: string;
  set_number: number;
  weight: number;
  reps: number;
  rpe?: number;
  is_warmup: boolean;
  notes?: string;
}

// --- Intelligence / Reports ---

export interface WeeklyReport {
  id: string;
  user_id: string;
  week_start: string;
  total_volume: number;
  hard_sets: number;
  report_json: WeeklyReportData;
  created_at: string;
}

export interface WeeklyReportData {
  workouts_completed: number;
  total_volume_lbs: number;
  hard_sets: number;
  volume_by_muscle: Record<MuscleGroup, number>;
  best_performance: { exercise_name: string; detail: string };
  exercises_improved: string[];
  exercises_stalled: string[];
  priority_muscle_status: Record<MuscleGroup, 'on_track' | 'below_target' | 'above_target'>;
  recommendations: string[];
}

export interface MonthlyAutopsy {
  id: string;
  user_id: string;
  month_start: string;
  autopsy_json: MonthlyAutopsyData;
  created_at: string;
}

export interface MonthlyAutopsyData {
  performance_summary: { exercise_name: string; change: string }[];
  most_productive_exercises: string[];
  highest_plateau_risk: string[];
  rep_range_findings: string[];
  volume_trends: Record<MuscleGroup, 'increasing' | 'stable' | 'decreasing'>;
  recommendations: string[];
}

export interface TrainingIdea {
  id: string;
  title: string;
  muscle_group: MuscleGroup;
  goal: TrainingGoal;
  method: string;
  description: string;
  equipment?: Equipment;
  use_case: string;
}

// --- Progressive Overload ---

export type ProgressionRecommendation =
  | 'add_weight'
  | 'add_reps'
  | 'repeat'
  | 'reduce_load'
  | 'deload'
  | 'change_rep_range'
  | 'rotate_exercise';

export interface ExerciseIntelligence {
  exercise_id: string;
  exercise_name: string;
  last_sets: SetLog[];
  trend: SetLog[][];
  recommendation: ProgressionRecommendation;
  target_weight?: number;
  target_reps?: number;
  coaching_note: string;
}
