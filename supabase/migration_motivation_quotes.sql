-- Motivation quotes/tips for the splash screen — add rows anytime from the dashboard,
-- no app update needed. The app merges these with its bundled list (offline-safe).
create table if not exists motivation_quotes (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'quote' check (kind in ('quote', 'tip')),
  text text not null,
  author text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table motivation_quotes enable row level security;

-- Readable by everyone (splash shows before login); writes stay dashboard-only.
create policy "motivation_quotes_read" on motivation_quotes
  for select using (true);
