# Career-Path Guessing Game — Design

**Date:** 2026-06-11
**Status:** Approved (pending spec review)

## Summary

A "Who Are Ya?"-style guessing game inside wc26-league. The player is shown a
mystery footballer's **club career timeline** (logos + years) revealed
progressively, and must guess who it is. Each guess shows attribute comparisons
(nationality, league, current club, age, position) coloured green/red. The pool
is the 2026 World Cup squads; career data comes from Wikidata (CC0), already
ingested into `player_career`.

The game has two modes — a **daily puzzle** (same player for everyone, social
comparison within leagues) and an **endless practice** mode — and lives in a new
top-nav **Games** section, with the daily puzzle also surfaced as a Dashboard
card. It keeps its **own leaderboards** (daily + all-time, league + global) and
does **not** touch the main WC prediction standings.

## Goals / Non-goals

**Goals**
- Fun, recognisable career-path guesser using existing WC player data.
- Server-authoritative play so leaderboards are trustworthy.
- Reuse the existing design system, fold-search, and server-action patterns.

**Non-goals**
- No player face photos (provider/data gap) — reveal uses name + flag + timeline.
- Does not feed the WC prediction scoring.
- No new auth, no realtime; standard server actions + page refresh.

## Mechanics (decided)

- **Progressive reveal:** start with **1 club shown** (earliest); every **guess
  or skip reveals the next chronological club**. Hidden clubs render as "?".
- **Guess limit `G` = number of distinct clubs** in the answer's career. Each
  guess or skip consumes one "move"; `movesUsed = guesses + skips ≤ G`.
- **Comparison chips** per guess (guessed player vs answer): nationality (flag),
  league, current club, **age (↑ if answer older, ↓ if younger, green if same
  year)**, position. Matching attribute = green, else red.
- **Timer:** count-**up** stopwatch, display-only on the client. The recorded
  time is **server-measured** (`finished_at − started_at`) and used only as a
  leaderboard tiebreaker.
- **Scoring:** `points = solved ? (G − movesUsed + 1) : 0`. Solving on the first
  move = `G` points; using all moves = 1; failing = 0.

## Data model

### Extend `player_career`
```sql
alter table player_career add column club_logo_url text;
alter table player_career add column league text;
alter table player_career add column is_loan boolean not null default false;
```
- `club_logo_url`, `league` per spell (denormalised; read-only game data).
- `is_loan` drives the "Loan" badge; set only if detectable from Wikidata,
  otherwise left false.

### New tables
```sql
create table daily_puzzle (
  date       date primary key,
  player_id  bigint not null references players(id)
);

create table game_session (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  player_id    bigint not null references players(id),   -- the answer (hidden)
  mode         text not null check (mode in ('daily','practice')),
  puzzle_date  date,                                      -- set for daily
  guessed_ids  bigint[] not null default '{}',            -- ordered guesses
  skips        int not null default 0,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  solved       boolean not null default false,
  points       int not null default 0
);
create unique index one_daily_per_user
  on game_session (user_id, puzzle_date) where mode = 'daily';
```

### RLS
- `daily_puzzle`, `player_career` — public read (reference data). Writes via
  service role / server actions only.
- `game_session` — `select`/`insert`/`update` only where `user_id = auth.uid()`.
  Nobody can read another user's session (which holds the answer).
- **Leaderboards** read others' results via a `SECURITY DEFINER` RPC that returns
  only safe columns — `display_name, points, time_ms, guesses, solved` — and
  **never `player_id`**, so today's daily answer cannot leak to someone who has
  not finished it.

### Comparison facts (no new storage)
Derived from existing data: nationality = national team (`players.team_id` →
team crest), position = `players.position`, age = `players.date_of_birth`,
current club + league = the player's last `player_career` spell.

## Data preparation (one-off ingestion, after careers)

A second script over the eligible pool (currently 578 players):
1. **Clean youth/reserve spells** — drop spells whose club is a reserve/youth
   team. Detection: Wikidata club `P31` (reserve/youth team classes) **plus** a
   name heuristic (`"C"`, `"B"`, `"II"`, `"Juvenil"`, `"Atlètic"`,
   `"U19/U21/U23"`, `"Reserve"`). Example to fix: Messi's Barça C / Juvenil A /
   Atlètic spells.
2. **Logos + leagues** — for each distinct club remaining, fetch Wikidata `P154`
   (logo → Wikimedia Commons `Special:FilePath` URL) and `P118` (league label);
   write onto `player_career` rows.
3. **Loans** — set `is_loan` where a `P54` loan qualifier is detectable.
4. **Recompute eligibility** — `career_game_eligible = true` only for players
   left with **≥3 real clubs** after cleaning.

Same conventions as the existing `scripts/ingest-careers.mjs`: standalone Node,
exact-dob-indexed queries, per-request timeout + retry, concurrency pool, live
progress file.

## Game flow (server-authoritative)

**Open (daily):**
1. Server ensures today's `daily_puzzle` exists; if not, lazy-creates it via
   `pickDailyPlayer(dateSeed, eligibleIds, recentIds)` — deterministic from the
   date, excluding the last ~30 days' answers, same for everyone. Creation is
   `insert ... on conflict (date) do nothing` then re-read, so simultaneous
   first-opens can't create two different puzzles.
2. Loads/creates the user's `game_session` for today. Finished → show read-only
   result. In-progress → resume from `guessed_ids`/`skips`.

**Guess / skip loop (each step = one server action):**
- Client sends a guess (`playerId`) or skip for the session id.
- Server appends to `guessed_ids` (or increments `skips`), reveals the **next**
  chronological club, and for a guess returns
  `{ correct, chips, newlyRevealedClub, movesRemaining }`.
- **Hidden clubs are never sent to the client** until revealed.
- On a correct guess or when moves are exhausted, the server **finalizes**
  (`solved`, `points`, `finished_at`) and returns the full reveal (name + flag +
  complete timeline).

**Practice:** same loop; server picks a random eligible answer
(`mode='practice'`, no `puzzle_date`), unlimited plays.

## Leaderboards

- **Daily:** `mode='daily' AND puzzle_date = today`, ordered by `points` desc,
  then `time_ms` asc. League view joins `league_members`; global view = all.
- **All-time:** per-user `sum(points)`, plus games played and solve rate. League
  + global.
- Served by the safe-columns RPC described under RLS.

## UI / routing

- **Nav:** new **Games** item → `/games` (hub): Career Path card, today's daily
  status, and leaderboards (daily/all-time × league/global toggle).
- **`/games/career`** (`?mode=daily` default | `?mode=practice`):
  `CareerTimeline` (circular club crests + years, "?" for hidden, "Loan" badge),
  `PlayerSearch` (fold-search autocomplete over WC players, excludes guessed),
  guesses list of `GuessRow` (comparison chips green/red), move-dots indicator,
  Skip button, count-up timer. Result state reveals name + flag + full timeline
  + points; practice → "Play next", daily → share + leaderboard peek.
- **Dashboard:** a "Daily puzzle" card (played/not + points, entry to the game).

**Components / units**
- Presentational: `CareerTimeline`, `GuessRow`, `PlayerSearch`.
- Client orchestrator: `CareerGame` (holds revealed state, calls actions).
- Server actions (`lib/games/career.ts`): `startCareerGame(mode)`,
  `submitGuess(sessionId, playerId)`, `skipReveal(sessionId)`,
  `getLeaderboard(scope, period)`.
- Pure logic (`lib/games/`): `scoreGame(G, movesUsed, solved)`,
  `comparePlayers(guess, answer)`, `pickDailyPlayer(seed, eligible, recent)`.

## Error handling

- Replaying the daily — blocked by the unique index; result shown instead.
- Invalid / non-WC guess — search only yields valid WC player ids; server
  rejects unknown ids.
- Duplicate guess of the same player — ignored.
- Moves exhausted — finalize as failed (`points = 0`).
- Action failures — return `{ error }`; client offers retry.

## Testing (TDD, Vitest)

- `scoreGame(G, movesUsed, solved)` — unit.
- `comparePlayers(guess, answer)` — per-attribute match + age direction — unit.
- `pickDailyPlayer(seed, eligible, recent)` — deterministic, excludes recent —
  unit.
- Server actions — integration via the temp-user E2E pattern: start session,
  submit guesses, assert reveal/scoring, assert **hidden clubs are not returned**
  before reveal, assert daily replay is blocked, assert leaderboard RPC hides
  `player_id`.

## Open follow-ups (not in this build)

- Player face photos (could source Wikidata `P18` later).
- Additional games in the Games section (e.g., transfer-fee guess).
- Curation UI for trimming career data by hand.
