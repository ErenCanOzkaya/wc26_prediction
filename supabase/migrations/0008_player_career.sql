-- Career-path game data. Each row is one club spell for a player, ordered.
-- Sourced from Wikidata (CC0), drafted by the ingestion script, then curated.
create table player_career (
  player_id  bigint references players(id) on delete cascade,
  ord        int not null,           -- 0-based chronological order
  club       text not null,
  start_year int,
  end_year   int,
  primary key (player_id, ord)
);
alter table player_career enable row level security;
create policy read_player_career on player_career for select using (true);

-- Only clean, recognizable careers are shown in the game.
alter table players add column if not exists career_game_eligible boolean not null default false;
