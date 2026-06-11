-- Phase 7+: Tournament XI ("Golden XI") prediction — a formation, 11 players
-- and a captain. Set-based scoring (positions don't matter for points).

create table tournament_xi (
  user_id    uuid primary key references profiles(id) on delete cascade,
  formation  text not null default '4-3-3',
  captain_id bigint references players(id),
  updated_at timestamptz not null default now()
);

create table xi_picks (
  user_id   uuid references profiles(id) on delete cascade,
  slot      int not null,                       -- 0..10
  player_id bigint references players(id),
  primary key (user_id, slot)
);

-- The actual Golden XI, resolved by the admin at tournament end.
alter table tournament_results add column if not exists golden_xi bigint[];

alter table tournament_xi enable row level security;
alter table xi_picks      enable row level security;

-- Owner read/write; league-mates can read (open, like the other predictions).
create policy own_xi on tournament_xi
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy read_xi on tournament_xi
  for select using (shares_league_with(user_id));

create policy own_xi_picks on xi_picks
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy read_xi_picks on xi_picks
  for select using (shares_league_with(user_id));
