-- Template Sessions: the individual sessions within a template (Push A, Pull A, etc.)
CREATE TABLE IF NOT EXISTS public.template_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid REFERENCES public.workout_templates(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  session_order integer NOT NULL,
  focus_muscles text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Template Session Exercises: exercises assigned to a specific session with targets
CREATE TABLE IF NOT EXISTS public.template_session_exercises (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  template_session_id uuid REFERENCES public.template_sessions(id) ON DELETE CASCADE NOT NULL,
  exercise_id uuid REFERENCES public.exercises(id) NOT NULL,
  exercise_order integer NOT NULL,
  target_sets integer NOT NULL DEFAULT 3,
  target_rep_min integer NOT NULL DEFAULT 8,
  target_rep_max integer NOT NULL DEFAULT 12,
  target_rpe numeric(3,1),
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add active template tracking to workout_templates
ALTER TABLE public.workout_templates
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_session_index integer DEFAULT 0;

-- RLS Policies
ALTER TABLE public.template_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_session_exercises ENABLE ROW LEVEL SECURITY;

-- template_sessions: users can only see/modify sessions for their own templates
CREATE POLICY "Users manage own template sessions"
  ON public.template_sessions
  USING (
    template_id IN (
      SELECT id FROM public.workout_templates WHERE user_id = auth.uid()
    )
  );

-- template_session_exercises: users can only see/modify exercises for their own templates
CREATE POLICY "Users manage own template session exercises"
  ON public.template_session_exercises
  USING (
    template_session_id IN (
      SELECT ts.id FROM public.template_sessions ts
      JOIN public.workout_templates wt ON ts.template_id = wt.id
      WHERE wt.user_id = auth.uid()
    )
  );
