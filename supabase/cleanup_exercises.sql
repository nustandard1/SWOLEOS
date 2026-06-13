-- Remove unnecessary columns
alter table public.exercises drop column if exists suggested_rep_min;
alter table public.exercises drop column if exists suggested_rep_max;
alter table public.exercises drop column if exists progression_eligible;
