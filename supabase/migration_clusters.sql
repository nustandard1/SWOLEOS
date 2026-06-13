-- SWOLE OS — cluster sets / myo-reps / partials.
-- A working set can carry extra "cluster" mini-sets done after a short rest.
-- Stored as an int array on the set, e.g. {3,3,3}. Volume = weight * (reps + sum(clusters)).
-- The set still counts as ONE working set; clusters only add volume.

alter table public.set_logs
  add column if not exists cluster_reps integer[];
