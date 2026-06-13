-- SWOLE/OS — manual body metrics
-- For lifters without a smart scale / Apple Health: log weight + body-fat % by hand.
-- These merge with any Apple Health readings into the same body-comp series that
-- feeds the Physique view, the body-comp read, and the strength-score bodyweight.

CREATE TABLE IF NOT EXISTS body_metrics (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_at  timestamptz NOT NULL DEFAULT now(),
  weight     numeric,   -- lbs
  body_fat   numeric,   -- percent
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE body_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own body_metrics" ON body_metrics
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS body_metrics_user_idx ON body_metrics (user_id, logged_at);
