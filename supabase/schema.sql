-- supabase/schema.sql — wc26-league
-- Apply in the Supabase SQL editor (or `supabase db push`).
-- Built from files/SCHEMA.sql with the RLS policies completed + a profile
-- bootstrap trigger added (the spec asked Claude Code to finish these).

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
  id            bigint primary key,           -- provider player id
  name          text not null,
  team_id       bigint references teams(id),
  date_of_birth date,
  position      text
);

create table matches (
  id             bigint primary key,          -- provider match id
  stage          stage not null,
  group_label    char(1),                     -- null for knockout
  matchday       int,
  kickoff        timestamptz not null,
  venue          text,
  home_team_id   bigint references teams(id),
  away_team_id   bigint references teams(id),
  home_score     int,                         -- normal/extra-time score
  away_score     int,
  winner_team_id bigint references teams(id), -- post-penalties for knockout
  status         match_status not null default 'scheduled',
  updated_at     timestamptz not null default now()
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

-- Leaderboard within a league = sum of member scores.
-- security_invoker = on so the view honours the querying user's RLS instead of
-- the view owner's (otherwise it would leak every user's total).
create view leaderboard_totals
  with (security_invoker = on) as
  select user_id, sum(points)::int as total
  from scores group by user_id;

-- ============================================================
-- Helper functions (SECURITY DEFINER to avoid RLS self-recursion on
-- league_members — a Postgres RLS gotcha when a policy queries its own table)
-- ============================================================

create or replace function public.is_member_of(p_league uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from league_members
    where league_id = p_league and user_id = auth.uid()
  );
$$;

create or replace function public.shares_league_with(p_user uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from league_members me
    join league_members other on me.league_id = other.league_id
    where me.user_id = auth.uid() and other.user_id = p_user
  );
$$;

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================

-- Reference tables: public read, writes only via the service-role poller
-- (service role bypasses RLS, so we add SELECT-only policies here).
alter table teams           enable row level security;
alter table players         enable row level security;
alter table matches         enable row level security;
alter table group_standings enable row level security;
alter table bracket_slots   enable row level security;

create policy read_teams           on teams           for select using (true);
create policy read_players         on players         for select using (true);
create policy read_matches         on matches         for select using (true);
create policy read_group_standings on group_standings for select using (true);
create policy read_bracket_slots   on bracket_slots   for select using (true);

-- User / league / prediction tables
alter table profiles            enable row level security;
alter table leagues             enable row level security;
alter table league_members      enable row level security;
alter table match_predictions   enable row level security;
alter table group_predictions   enable row level security;
alter table bracket_predictions enable row level security;
alter table special_predictions enable row level security;
alter table watchlist           enable row level security;
alter table scores              enable row level security;

-- Profiles: read your own + co-members (for leaderboards); edit only your own.
create policy read_profiles on profiles
  for select using (id = auth.uid() or shares_league_with(id));
create policy update_own_profile on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Leagues: owner or member can read; owner can create/modify.
create policy read_leagues on leagues
  for select using (owner_id = auth.uid() or is_member_of(id));
create policy insert_leagues on leagues
  for insert with check (owner_id = auth.uid());
create policy update_own_leagues on leagues
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy delete_own_leagues on leagues
  for delete using (owner_id = auth.uid());

-- League members: read members of leagues you're in; add/remove only yourself.
-- (Invite-code validation for joins is enforced by a SECURITY DEFINER RPC in
--  Phase 5; this policy still lets a user insert their own membership row.)
create policy read_league_members on league_members
  for select using (is_member_of(league_id));
create policy join_league_self on league_members
  for insert with check (user_id = auth.uid());
create policy leave_league_self on league_members
  for delete using (user_id = auth.uid());

-- Predictions: owner has full read/write on their own rows...
create policy own_match_preds on match_predictions
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_group_preds on group_predictions
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_bracket_preds on bracket_predictions
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_special_preds on special_predictions
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ...and league co-members can READ each other's predictions, but ONLY after
-- the relevant lock has passed (DESIGN §6). This makes opponents' picks visible
-- for the match/league detail screens without enabling pre-lock copying.
-- The lock is enforced here at the DB boundary (not just the UI).

-- Match score locks at that match's kickoff.
create policy read_comember_match_preds on match_predictions
  for select using (
    shares_league_with(user_id)
    and exists (
      select 1 from matches m
      where m.id = match_predictions.match_id and m.kickoff <= now()
    )
  );

-- Group standings lock at the first kickoff of THAT group.
create policy read_comember_group_preds on group_predictions
  for select using (
    shares_league_with(user_id)
    and exists (
      select 1 from matches m
      where m.stage = 'group'
        and m.group_label = group_predictions.group_label
        and m.kickoff <= now()
    )
  );

-- Bracket locks at the first Round-of-32 kickoff.
create policy read_comember_bracket_preds on bracket_predictions
  for select using (
    shares_league_with(user_id)
    and exists (
      select 1 from matches m where m.stage = 'r32' and m.kickoff <= now()
    )
  );

-- Specials lock at the tournament opening kickoff (the earliest match overall).
create policy read_comember_special_preds on special_predictions
  for select using (
    shares_league_with(user_id)
    and exists (select 1 from matches m where m.kickoff <= now())
  );

-- Watchlist stays private to its owner (it's a personal calendar flag, not a
-- competitive prediction).
create policy own_watchlist on watchlist
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Scores: the engine (service role) writes; users read their own + co-members'.
-- No INSERT/UPDATE policy for users -> they cannot fabricate scores.
create policy read_scores on scores
  for select using (user_id = auth.uid() or shares_league_with(user_id));

-- Helpful indexes for the poller / leaderboard queries.
create index matches_status_idx   on matches (status);
create index matches_kickoff_idx  on matches (kickoff);
create index matches_stage_idx    on matches (stage);
create index scores_user_idx      on scores (user_id);
create index league_members_user_idx on league_members (user_id);
