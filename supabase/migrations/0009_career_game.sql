-- Career-path game: club visuals on the career rows + game tables.

-- 1) Extend player_career for the timeline display.
alter table player_career add column if not exists club_logo_url text;
alter table player_career add column if not exists league text;
alter table player_career add column if not exists is_loan boolean not null default false;

-- 2) The shared daily puzzle (same answer for everyone on a given date).
create table daily_puzzle (
  date       date primary key,
  player_id  bigint not null references players(id)
);
alter table daily_puzzle enable row level security;
create policy read_daily_puzzle on daily_puzzle for select using (true);

-- 3) Per-user game session. Holds the (hidden) answer, guesses, timing, score.
create table game_session (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  player_id    bigint not null references players(id),
  mode         text not null check (mode in ('daily','practice')),
  puzzle_date  date,
  guessed_ids  bigint[] not null default '{}',
  skips        int not null default 0,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  solved       boolean not null default false,
  points       int not null default 0
);
create unique index one_daily_per_user
  on game_session (user_id, puzzle_date) where mode = 'daily';

alter table game_session enable row level security;
create policy own_session_select on game_session for select using (user_id = auth.uid());
create policy own_session_insert on game_session for insert with check (user_id = auth.uid());
create policy own_session_update on game_session for update using (user_id = auth.uid());

-- 4) Leaderboard RPC — returns only safe columns, never player_id (the answer).
-- scope: 'global' or a league id (uuid as text); period: 'daily' or 'all'.
create or replace function career_leaderboard(p_scope text, p_period text, p_date date)
returns table (display_name text, points bigint, time_ms bigint, games bigint, solved bigint)
language sql
security definer
set search_path = public
as $$
  with rows as (
    select s.user_id,
           s.points,
           extract(epoch from (s.finished_at - s.started_at)) * 1000 as time_ms,
           s.solved
    from game_session s
    where s.finished_at is not null
      and (
        (p_period = 'daily' and s.mode = 'daily' and s.puzzle_date = p_date)
        or (p_period = 'all')
      )
      and (
        p_scope = 'global'
        or s.user_id in (
          select lm.user_id from league_members lm
          where lm.league_id = p_scope::uuid
            and is_member_of(p_scope::uuid)
        )
      )
  )
  select pr.display_name,
         sum(r.points)::bigint as points,
         min(r.time_ms)::bigint as time_ms,
         count(*)::bigint as games,
         sum(case when r.solved then 1 else 0 end)::bigint as solved
  from rows r
  join profiles pr on pr.id = r.user_id
  group by pr.display_name
  order by points desc, time_ms asc;
$$;
