-- Phase 4: tables the scoring engine needs that weren't in the base schema.
-- Run in the Supabase SQL editor.

-- Top scorers cache (Golden Boot resolution). Written by the poller.
create table scorers (
  player_id   bigint primary key,
  player_name text not null,
  team_id     bigint references teams(id),
  goals       int not null default 0,
  assists     int,
  updated_at  timestamptz not null default now()
);
alter table scorers enable row level security;
create policy read_scorers on scorers for select using (true);

-- Single-row store for award actuals resolved at tournament end.
-- Golden Boot can be auto-filled from `scorers`; Best / Best Young are set by
-- the admin (no UI yet). Written by the service role only.
create table tournament_results (
  id              int primary key default 1,
  golden_boot_id  bigint references players(id),
  best_player_id  bigint references players(id),
  best_young_id   bigint references players(id),
  updated_at      timestamptz not null default now(),
  constraint single_row check (id = 1)
);
alter table tournament_results enable row level security;
create policy read_results on tournament_results for select using (true);
