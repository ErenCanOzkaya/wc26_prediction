-- Phase 7: let a user pick their nation (a national team) for their profile card.
alter table profiles
  add column if not exists country_team_id bigint references teams(id);
