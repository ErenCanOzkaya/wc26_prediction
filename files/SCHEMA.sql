-- SCHEMA.sql — Postgres / Supabase schema for wc26-league
-- Apply in Supabase SQL editor. Assumes Supabase Auth (auth.users) exists.
-- RLS: core policies below; Claude Code should complete per-table policies.

-- ============================================================
-- Reference data (teams, players, fixtures) — written by the poller
-- ============================================================

create type stage as enum (
  'group','r32','r16','qf','sf','third_place','final'
);

create type match_status as enum (
  'scheduled','live','finished','postponed','void'
);

create table teams (
  id           bigint primary key,            -- provider team id
  name         text not null,
  short_name   text,
  group_label  char(1),                       -- 'A'..'L' (group stage)
  crest_url    text
);

create table players (
  id           bigint primary key,            -- provider player id
  name         text not null,
  team_id      bigint references teams(id),
  date_of_birth date,
  position     text
);

create table matches (
  id            bigint primary key,           -- provider match id
  stage         stage not null,
  group_label   char(1),                      -- null for knockout
  matchday      int,
  kickoff       timestamptz not null,
  venue         text,
  home_team_id  bigint references teams(id),
  away_team_id  bigint references teams(id),
  home_score    int,                          -- normal/extra-time score
  away_score    int,
  winner_team_id bigint references teams(id), -- post-penalties for knockout
  status        match_status not null default 'scheduled',
  updated_at    timestamptz not null default now()
);

-- Final/derived group table (from API standings or computed)
create table group_standings (
  group_label   char(1) not null,
  team_id       bigint not null references teams(id),
  position      int not null,                 -- 1..4
  played        int default 0,
  points        int default 0,
  goal_diff     int default 0,
  goals_for     int default 0,
  qualified     text,                         -- 'direct' | 'third' | null
  primary key (group_label, team_id)
);

-- Official knockout progression: which team reached which stage, via which slot
create table bracket_slots (
  id            text primary key,             -- e.g. 'R32-1','R16-3','FINAL'
  stage         stage not null,
  team_id       bigint references teams(id),  -- filled as it resolves
  source_a      text,                         -- predecessor slot ids (for path)
  source_b      text
);

-- ============================================================
-- Users & leagues
-- ============================================================

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table leagues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  owner_id     uuid not null references profiles(id),
  invite_code  text not null unique,
  created_at   timestamptz not null default now()
);

create table league_members (
  league_id    uuid references leagues(id) on delete cascade,
  user_id      uuid references profiles(id) on delete cascade,
  role         text not null default 'member',  -- 'owner' | 'member'
  joined_at    timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- ============================================================
-- Predictions (owned by user, league-INDEPENDENT)
-- ============================================================

create table match_predictions (
  user_id      uuid references profiles(id) on delete cascade,
  match_id     bigint references matches(id),
  home_score   int not null,
  away_score   int not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, match_id)
);

-- One row per team per group = predicted final position
create table group_predictions (
  user_id      uuid references profiles(id) on delete cascade,
  group_label  char(1) not null,
  team_id      bigint references teams(id),
  position     int not null,                 -- 1..4
  updated_at   timestamptz not null default now(),
  primary key (user_id, group_label, team_id)
);

-- Predicted team per bracket slot (the single editable bracket, post-group update)
create table bracket_predictions (
  user_id      uuid references profiles(id) on delete cascade,
  slot_id      text references bracket_slots(id),
  team_id      bigint references teams(id),
  version      int not null default 1,       -- bump on the allowed update
  updated_at   timestamptz not null default now(),
  primary key (user_id, slot_id)
);

create table special_predictions (
  user_id          uuid references profiles(id) on delete cascade,
  golden_boot_id   bigint references players(id),
  best_player_id   bigint references players(id),
  best_young_id    bigint references players(id),
  updated_at       timestamptz not null default now(),
  primary key (user_id)
);

-- Calendar: matches a user marked "I'll watch"
create table watchlist (
  user_id      uuid references profiles(id) on delete cascade,
  match_id     bigint references matches(id),
  primary key (user_id, match_id)
);

-- ============================================================
-- Scores (engine output — idempotent, replayable)
-- ============================================================
-- category: 'match' | 'group' | 'bracket' | 'special' | 'matchday_bonus'
-- ref_id encodes the unit (match_id, group_label, slot_id, special key, date)
create table scores (
  user_id      uuid references profiles(id) on delete cascade,
  category     text not null,
  ref_id       text not null,
  points       int not null,
  computed_at  timestamptz not null default now(),
  primary key (user_id, category, ref_id)
);

-- Leaderboard within a league = sum of member scores
-- create as a view or compute in query:
create view leaderboard_totals as
  select user_id, sum(points)::int as total
  from scores group by user_id;

-- ============================================================
-- RLS (enable + core policies; complete the rest)
-- ============================================================
alter table profiles            enable row level security;
alter table leagues             enable row level security;
alter table league_members      enable row level security;
alter table match_predictions   enable row level security;
alter table group_predictions   enable row level security;
alter table bracket_predictions enable row level security;
alter table special_predictions enable row level security;
alter table watchlist           enable row level security;
alter table scores              enable row level security;

-- A user can read/write only their own predictions:
create policy own_match_preds on match_predictions
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Replicate the analogous policy for group/bracket/special/watchlist.

-- League members can read each other's scores (for leaderboards) but not edit:
create policy read_league_scores on scores
  for select using (
    user_id in (
      select lm2.user_id from league_members lm1
      join league_members lm2 on lm1.league_id = lm2.league_id
      where lm1.user_id = auth.uid()
    )
  );

-- Reference tables (teams, players, matches, standings, bracket_slots) are
-- public-read, written only by the service-role poller.
