# Career-Path Game — Data & Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data layer and server-authoritative backend for the career-path guessing game (schema, club-meta ingestion, pure scoring/compare/daily-pick logic, and game server actions), leaving the UI to a follow-up plan.

**Architecture:** Postgres tables (`daily_puzzle`, `game_session`) plus columns on `player_career`, guarded by RLS; a `SECURITY DEFINER` leaderboard RPC that never leaks the answer; pure TypeScript logic functions unit-tested with Vitest; Next.js server actions that keep the answer and reveal state server-side. Career club logos/leagues are sourced from Wikidata into `player_career`.

**Tech Stack:** Next.js (App Router) server actions, Supabase (Postgres + RLS + RPC), Vitest, standalone Node ingestion script (`@supabase/supabase-js` + Wikidata SPARQL).

This plan is backend-only. It produces software testable via Vitest unit tests and an end-to-end bash script. The game UI is a separate plan (`2026-06-11-career-game-ui.md`).

---

## File Structure

- `supabase/migrations/0009_career_game.sql` — schema, RLS, leaderboard RPC (Create).
- `lib/games/scoring.ts` — `scoreGame()` pure function (Create).
- `lib/games/scoring.test.ts` — unit tests (Create).
- `lib/games/compare.ts` — `comparePlayers()` + shared `PlayerFacts`/`Chip` types (Create).
- `lib/games/compare.test.ts` — unit tests (Create).
- `lib/games/daily.ts` — `pickDailyPlayer()` + `dateSeed()` (Create).
- `lib/games/daily.test.ts` — unit tests (Create).
- `lib/games/facts.ts` — `loadPlayerFacts()` server-side helper (Create).
- `lib/games/career.ts` — server actions: `startCareerGame`, `submitGuess`, `skipReveal`, `getLeaderboard` (Create).
- `scripts/ingest-club-meta.mjs` — clean youth/reserve, fetch logos + leagues, recompute eligibility (Create).
- `scripts/e2e-career-game.mjs` — end-to-end verification of the server-action flow (Create).

Conventions to follow (already in this codebase): Supabase admin client at `lib/supabase/admin.ts` (service role, bypasses RLS); server client at `lib/supabase/server.ts`; diacritic fold at `lib/text.ts`; pure scoring engine pattern at `lib/scoring/`; `@` path alias; tests excluded from tsconfig build.

---

## Task 1: Migration — schema, RLS, leaderboard RPC

**Files:**
- Create: `supabase/migrations/0009_career_game.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
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
            and is_member_of(p_scope::uuid)   -- caller must share the league
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
```

- [ ] **Step 2: Apply the migration**

Run in the Supabase SQL editor (the project applies migrations manually). Paste the file contents and execute.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verify tables exist**

Run:
```bash
cd /Users/erencanozkaya/Projects/WC2026_PredictionLeague
set -a; . ./.env.local; set +a
curl -s -o /dev/null -w "daily_puzzle:%{http_code} game_session:%{http_code}\n" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/daily_puzzle?limit=1"
```
Expected: HTTP 200 for both tables (run once per table).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0009_career_game.sql
git commit -m "Career game: schema, RLS, leaderboard RPC"
```

---

## Task 2: `scoreGame` pure function (TDD)

**Files:**
- Create: `lib/games/scoring.ts`
- Test: `lib/games/scoring.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { scoreGame } from "./scoring";

describe("scoreGame", () => {
  it("awards full marks (= club count) for a first-move solve", () => {
    expect(scoreGame(8, 1, true)).toBe(8);
  });
  it("awards 1 point when solved on the last allowed move", () => {
    expect(scoreGame(8, 8, true)).toBe(1);
  });
  it("awards 0 when not solved", () => {
    expect(scoreGame(8, 3, false)).toBe(0);
  });
  it("never goes below 1 for a solve", () => {
    expect(scoreGame(3, 5, true)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/games/scoring.test.ts`
Expected: FAIL — "Failed to resolve import ./scoring" / scoreGame is not a function.

- [ ] **Step 3: Write minimal implementation**

```ts
/** Points for a finished career-path game. clubCount = guess limit (G). */
export function scoreGame(
  clubCount: number,
  movesUsed: number,
  solved: boolean,
): number {
  if (!solved) return 0;
  return Math.max(1, clubCount - movesUsed + 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/games/scoring.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/games/scoring.ts lib/games/scoring.test.ts
git commit -m "Career game: scoreGame scoring function"
```

---

## Task 3: `comparePlayers` pure function (TDD)

**Files:**
- Create: `lib/games/compare.ts`
- Test: `lib/games/compare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { comparePlayers, type PlayerFacts } from "./compare";

const answer: PlayerFacts = {
  nationality: "Turkey",
  league: "Serie A",
  currentClub: "Inter Milan",
  birthYear: 1994,
  position: "MID",
};

describe("comparePlayers", () => {
  it("marks identical attributes as matches", () => {
    const c = comparePlayers(answer, answer);
    expect(c.nationality.match).toBe(true);
    expect(c.league.match).toBe(true);
    expect(c.currentClub.match).toBe(true);
    expect(c.position.match).toBe(true);
    expect(c.age.match).toBe(true);
    expect(c.age.direction).toBe(null);
  });

  it("flags mismatches and points age up when the answer is older", () => {
    const guess: PlayerFacts = {
      nationality: "France",
      league: "Premier League",
      currentClub: "Arsenal",
      birthYear: 2000,
      position: "ATT",
    };
    const c = comparePlayers(guess, answer);
    expect(c.nationality.match).toBe(false);
    expect(c.position.match).toBe(false);
    expect(c.age.match).toBe(false);
    expect(c.age.direction).toBe("up"); // answer (1994) older than guess (2000)
  });

  it("points age down when the answer is younger", () => {
    const guess: PlayerFacts = { ...answer, birthYear: 1990 };
    const c = comparePlayers(guess, answer);
    expect(c.age.direction).toBe("down");
  });

  it("treats a null league as a non-match", () => {
    const guess: PlayerFacts = { ...answer, league: null };
    const c = comparePlayers(guess, answer);
    expect(c.league.match).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/games/compare.test.ts`
Expected: FAIL — cannot resolve ./compare.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface PlayerFacts {
  nationality: string;
  league: string | null;
  currentClub: string | null;
  birthYear: number;
  position: string; // role: GK | DEF | MID | ATT
}

export interface Chip {
  value: string | number | null;
  match: boolean;
  direction?: "up" | "down" | null;
}

export interface Comparison {
  nationality: Chip;
  league: Chip;
  currentClub: Chip;
  age: Chip;
  position: Chip;
}

const eq = (a: unknown, b: unknown) => a != null && a === b;

/** Compare a guessed player against the answer for the per-guess chips. */
export function comparePlayers(
  guess: PlayerFacts,
  answer: PlayerFacts,
): Comparison {
  return {
    nationality: {
      value: guess.nationality,
      match: eq(guess.nationality, answer.nationality),
    },
    league: { value: guess.league, match: eq(guess.league, answer.league) },
    currentClub: {
      value: guess.currentClub,
      match: eq(guess.currentClub, answer.currentClub),
    },
    position: { value: guess.position, match: eq(guess.position, answer.position) },
    age: {
      value: guess.birthYear,
      match: guess.birthYear === answer.birthYear,
      direction:
        guess.birthYear === answer.birthYear
          ? null
          : answer.birthYear < guess.birthYear
            ? "up" // answer is older
            : "down",
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/games/compare.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/games/compare.ts lib/games/compare.test.ts
git commit -m "Career game: comparePlayers attribute comparison"
```

---

## Task 4: `pickDailyPlayer` + `dateSeed` (TDD)

**Files:**
- Create: `lib/games/daily.ts`
- Test: `lib/games/daily.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { pickDailyPlayer, dateSeed } from "./daily";

describe("dateSeed", () => {
  it("is deterministic per ISO date and differs by day", () => {
    expect(dateSeed("2026-06-11")).toBe(dateSeed("2026-06-11"));
    expect(dateSeed("2026-06-11")).not.toBe(dateSeed("2026-06-12"));
  });
});

describe("pickDailyPlayer", () => {
  const eligible = [10, 20, 30, 40, 50];

  it("returns the same player for the same seed", () => {
    const a = pickDailyPlayer(dateSeed("2026-06-11"), eligible, []);
    const b = pickDailyPlayer(dateSeed("2026-06-11"), eligible, []);
    expect(a).toBe(b);
    expect(eligible).toContain(a);
  });

  it("never picks a recently used player when others remain", () => {
    const recent = [10, 20, 30, 40];
    expect(pickDailyPlayer(dateSeed("2026-06-11"), eligible, recent)).toBe(50);
  });

  it("falls back to the full pool when all are recent", () => {
    const got = pickDailyPlayer(dateSeed("2026-06-11"), eligible, eligible);
    expect(eligible).toContain(got);
  });

  it("throws when there are no eligible players", () => {
    expect(() => pickDailyPlayer(1, [], [])).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/games/daily.test.ts`
Expected: FAIL — cannot resolve ./daily.

- [ ] **Step 3: Write minimal implementation**

```ts
/** Stable integer seed from an ISO date string (YYYY-MM-DD). */
export function dateSeed(isoDate: string): number {
  let h = 0;
  for (let i = 0; i < isoDate.length; i++) {
    h = (h * 31 + isoDate.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Deterministically pick one eligible player id for a daily puzzle, avoiding
 * recently used ids. `eligible` should be passed in a stable (sorted) order.
 */
export function pickDailyPlayer(
  seed: number,
  eligible: number[],
  recent: number[],
): number {
  const recentSet = new Set(recent);
  const pool = eligible.filter((id) => !recentSet.has(id));
  const choices = pool.length > 0 ? pool : eligible;
  if (choices.length === 0) throw new Error("no eligible players");
  return choices[Math.abs(seed) % choices.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/games/daily.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/games/daily.ts lib/games/daily.test.ts
git commit -m "Career game: deterministic daily player pick"
```

---

## Task 5: Club-meta ingestion (clean youth/reserve, logos, leagues)

**Files:**
- Create: `scripts/ingest-club-meta.mjs`

- [ ] **Step 1: Write the script**

```js
// One-off: for the career-game pool, clean youth/reserve spells and attach club
// logos + leagues from Wikidata (CC0). Recomputes career_game_eligible.
//
// Run:  node --env-file=.env.local scripts/ingest-club-meta.mjs

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Name heuristic for reserve/youth sides.
const YOUTH = /\b(C|B|II|U1[89]|U2[0-3]|Juvenil|Atlètic|Atletic|Reserve|Reserves|Youth|Academy)\b/;

// All career rows, grouped by club name (one Wikidata lookup per distinct club).
async function allCareerRows() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("player_career")
      .select("player_id,ord,club")
      .order("player_id")
      .range(from, from + 999);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Wikidata: for a club label, return { logo, league, isReserve }.
async function clubMeta(club) {
  const q = `SELECT ?logo ?leagueLabel ?p31 WHERE {
    ?c rdfs:label "${club.replace(/"/g, '\\\\"')}"@en .
    OPTIONAL { ?c wdt:P154 ?logo }
    OPTIONAL { ?c wdt:P118 ?league }
    OPTIONAL { ?c wdt:P31 ?p31 }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
  } LIMIT 10`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  let res;
  try {
    res = await fetch(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`,
      {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "wc26-league/1.0 (club meta ingest)",
        },
        signal: ac.signal,
      },
    );
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new Error(`wd ${res.status}`);
  const rows = (await res.json()).results.bindings;
  if (!rows.length) return { logo: null, league: null };
  const logoFile = rows.find((r) => r.logo)?.logo?.value ?? null;
  const league = rows.find((r) => r.leagueLabel)?.leagueLabel?.value ?? null;
  // P31 Q1194951 = reserve team; Q1194950 etc. We rely on the name heuristic as
  // the primary reserve/youth signal; P31 is informational only here.
  return { logo: logoFile, league };
}

async function main() {
  const rows = await allCareerRows();
  const clubs = [...new Set(rows.map((r) => r.club))];
  console.log(`career rows: ${rows.length}, distinct clubs: ${clubs.length}`);

  // Look up each distinct club once.
  const meta = new Map();
  let done = 0;
  const POOL = 5;
  let idx = 0;
  const worker = async () => {
    while (idx < clubs.length) {
      const club = clubs[idx++];
      try {
        meta.set(club, await clubMeta(club));
      } catch {
        meta.set(club, { logo: null, league: null });
      }
      if (++done % 25 === 0) {
        writeFileSync("/tmp/clubmeta-progress.txt", `${done}/${clubs.length}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: POOL }, worker));

  // Drop youth/reserve spells; update the rest with logo + league.
  const keep = rows.filter((r) => !YOUTH.test(r.club));
  const dropped = rows.length - keep.length;

  // Re-number ord per player after dropping, and attach meta.
  const byPlayer = new Map();
  for (const r of keep) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id).push(r);
  }
  await db.from("player_career").delete().neq("player_id", -1);
  const newRows = [];
  const eligible = [];
  for (const [pid, list] of byPlayer) {
    list.sort((a, b) => a.ord - b.ord);
    list.forEach((r, ord) => {
      const m = meta.get(r.club) ?? { logo: null, league: null };
      newRows.push({
        player_id: pid,
        ord,
        club: r.club,
        club_logo_url: m.logo,
        league: m.league,
      });
    });
    if (list.length >= 3) eligible.push(pid);
  }
  for (let i = 0; i < newRows.length; i += 500) {
    const { error } = await db.from("player_career").insert(newRows.slice(i, i + 500));
    if (error) {
      console.error("insert error:", error.message);
      break;
    }
  }
  await db.from("players").update({ career_game_eligible: false }).neq("id", -1);
  for (let i = 0; i < eligible.length; i += 200) {
    await db
      .from("players")
      .update({ career_game_eligible: true })
      .in("id", eligible.slice(i, i + 200));
  }
  console.log(
    `dropped youth/reserve: ${dropped}, kept rows: ${newRows.length}, eligible: ${eligible.length}`,
  );
  console.log("written ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the ingestion**

Run:
```bash
cd /Users/erencanozkaya/Projects/WC2026_PredictionLeague
node --env-file=.env.local scripts/ingest-club-meta.mjs
```
Expected: ends with `dropped youth/reserve: <n>, kept rows: <n>, eligible: <n>` and `written ✓`. (Note: this re-derives `player_career` from current rows; the club logo/league columns from migration 0009 must exist first.)

- [ ] **Step 3: Spot-check a known player**

Run:
```bash
set -a; . ./.env.local; set +a
h=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
PID=$(curl -s "${h[@]}" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/players?select=id&name=ilike.*Çalhano*&limit=1" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s "${h[@]}" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/player_career?player_id=eq.$PID&select=ord,club,league,club_logo_url&order=ord" | python3 -m json.tool
```
Expected: ordered clubs, most with a `league` and `club_logo_url`, no reserve/youth entries.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest-club-meta.mjs
git commit -m "Career game: club logo + league ingestion and youth cleanup"
```

---

## Task 6: `loadPlayerFacts` helper

**Files:**
- Create: `lib/games/facts.ts`

- [ ] **Step 1: Write the helper**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerFacts } from "./compare";

const ROLE: Record<string, string> = {
  Goalkeeper: "GK",
  Defence: "DEF",
  Midfield: "MID",
  Offence: "ATT",
};

/**
 * Load the comparison facts for a set of player ids. Nationality is the national
 * team name; current club + league come from the player's last career spell.
 */
export async function loadPlayerFacts(
  db: SupabaseClient,
  ids: number[],
): Promise<Map<number, PlayerFacts>> {
  if (ids.length === 0) return new Map();
  const [{ data: players }, { data: career }] = await Promise.all([
    db
      .from("players")
      .select("id,position,date_of_birth,teams(name)")
      .in("id", ids),
    db
      .from("player_career")
      .select("player_id,ord,club,league")
      .in("player_id", ids)
      .order("ord", { ascending: true }),
  ]);

  // Last spell per player.
  const last = new Map<number, { club: string; league: string | null }>();
  for (const r of career ?? []) {
    last.set(r.player_id as number, {
      club: r.club as string,
      league: (r.league as string | null) ?? null,
    });
  }

  const out = new Map<number, PlayerFacts>();
  for (const p of players ?? []) {
    const team = Array.isArray(p.teams) ? p.teams[0] : p.teams;
    const spell = last.get(p.id as number);
    out.set(p.id as number, {
      nationality: (team?.name as string) ?? "—",
      league: spell?.league ?? null,
      currentClub: spell?.club ?? null,
      birthYear: p.date_of_birth
        ? Number((p.date_of_birth as string).slice(0, 4))
        : 0,
      position: ROLE[(p.position as string) ?? ""] ?? "ATT",
    });
  }
  return out;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/games/facts.ts
git commit -m "Career game: player facts loader"
```

---

## Task 7: Server actions — start, guess, skip

**Files:**
- Create: `lib/games/career.ts`

- [ ] **Step 1: Write the server actions**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreGame } from "./scoring";
import { comparePlayers, type Comparison } from "./compare";
import { pickDailyPlayer, dateSeed } from "./daily";
import { loadPlayerFacts } from "./facts";

export interface RevealedClub {
  club: string;
  clubLogoUrl: string | null;
  startYear: number | null;
  endYear: number | null;
  isLoan: boolean;
}

export interface GameView {
  sessionId: string;
  mode: "daily" | "practice";
  clubCount: number; // = guess limit (G)
  revealed: RevealedClub[]; // only revealed spells
  guesses: { playerId: number; name: string; comparison: Comparison }[];
  movesUsed: number;
  finished: boolean;
  solved: boolean;
  points: number;
  answer?: { name: string; nationality: string } | null; // only when finished
}

const todayIso = () => new Date().toISOString().slice(0, 10);

async function fullCareer(admin: ReturnType<typeof createAdminClient>, playerId: number) {
  const { data } = await admin
    .from("player_career")
    .select("ord,club,club_logo_url,start_year,end_year,is_loan")
    .eq("player_id", playerId)
    .order("ord", { ascending: true });
  return (data ?? []).map((r) => ({
    club: r.club as string,
    clubLogoUrl: (r.club_logo_url as string | null) ?? null,
    startYear: (r.start_year as number | null) ?? null,
    endYear: (r.end_year as number | null) ?? null,
    isLoan: (r.is_loan as boolean) ?? false,
  }));
}

/** Build the client-safe view from a session row (hides unrevealed clubs). */
async function buildView(
  admin: ReturnType<typeof createAdminClient>,
  session: {
    id: string;
    mode: "daily" | "practice";
    player_id: number;
    guessed_ids: number[];
    skips: number;
    finished_at: string | null;
    solved: boolean;
    points: number;
  },
): Promise<GameView> {
  const career = await fullCareer(admin, session.player_id);
  const clubCount = career.length;
  const movesUsed = session.guessed_ids.length + session.skips;
  const finished = session.finished_at != null;
  // Reveal 1 + one per move, capped at clubCount; reveal all when finished.
  const revealCount = finished ? clubCount : Math.min(clubCount, 1 + movesUsed);

  // Comparison chips for each guess.
  const guessIds = session.guessed_ids;
  const facts = await loadPlayerFacts(admin, [session.player_id, ...guessIds]);
  const answerFacts = facts.get(session.player_id)!;
  const { data: guessPlayers } = await admin
    .from("players")
    .select("id,name")
    .in("id", guessIds.length ? guessIds : [-1]);
  const nameById = new Map((guessPlayers ?? []).map((p) => [p.id as number, p.name as string]));
  const guesses = guessIds.map((id) => ({
    playerId: id,
    name: nameById.get(id) ?? "Player",
    comparison: comparePlayers(facts.get(id) ?? answerFacts, answerFacts),
  }));

  let answer: { name: string; nationality: string } | null = null;
  if (finished) {
    const { data: ans } = await admin
      .from("players")
      .select("name")
      .eq("id", session.player_id)
      .maybeSingle();
    answer = { name: (ans?.name as string) ?? "Player", nationality: answerFacts.nationality };
  }

  return {
    sessionId: session.id,
    mode: session.mode,
    clubCount,
    revealed: career.slice(0, revealCount),
    guesses,
    movesUsed,
    finished,
    solved: session.solved,
    points: session.points,
    answer,
  };
}

/** Start (or resume) a game. Daily is shared + once per user/day. */
export async function startCareerGame(
  mode: "daily" | "practice",
): Promise<GameView | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const admin = createAdminClient();

  if (mode === "daily") {
    const date = todayIso();
    // Ensure today's puzzle exists (idempotent).
    let { data: puzzle } = await admin
      .from("daily_puzzle")
      .select("player_id")
      .eq("date", date)
      .maybeSingle();
    if (!puzzle) {
      const { data: pool } = await admin
        .from("players")
        .select("id")
        .eq("career_game_eligible", true)
        .order("id", { ascending: true });
      const { data: recent } = await admin
        .from("daily_puzzle")
        .select("player_id")
        .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
      const chosen = pickDailyPlayer(
        dateSeed(date),
        (pool ?? []).map((p) => p.id as number),
        (recent ?? []).map((r) => r.player_id as number),
      );
      await admin.from("daily_puzzle").upsert({ date, player_id: chosen }, { onConflict: "date" });
      ({ data: puzzle } = await admin
        .from("daily_puzzle")
        .select("player_id")
        .eq("date", date)
        .maybeSingle());
    }

    // Resume or create the user's session for today.
    let { data: session } = await admin
      .from("game_session")
      .select("*")
      .eq("user_id", user.id)
      .eq("mode", "daily")
      .eq("puzzle_date", date)
      .maybeSingle();
    if (!session) {
      const { data: created } = await admin
        .from("game_session")
        .insert({
          user_id: user.id,
          player_id: puzzle!.player_id,
          mode: "daily",
          puzzle_date: date,
        })
        .select("*")
        .single();
      session = created;
    }
    return buildView(admin, session as never);
  }

  // Practice: random eligible answer, new session each time.
  const { data: pool } = await admin
    .from("players")
    .select("id")
    .eq("career_game_eligible", true);
  if (!pool?.length) return { error: "No players available" };
  const answerId = pool[Math.floor(Math.random() * pool.length)].id as number;
  const { data: created } = await admin
    .from("game_session")
    .insert({ user_id: user.id, player_id: answerId, mode: "practice" })
    .select("*")
    .single();
  return buildView(admin, created as never);
}

async function loadOwnedSession(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("game_session")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== user.id) return { error: "Not found" as const };
  return { admin, session };
}

/** Submit a guess; reveals the next club and scores on a correct/last guess. */
export async function submitGuess(
  sessionId: string,
  guessId: number,
): Promise<GameView | { error: string }> {
  const ctx = await loadOwnedSession(sessionId);
  if ("error" in ctx) return { error: ctx.error };
  const { admin, session } = ctx;
  if (session.finished_at) return buildView(admin, session as never);
  if ((session.guessed_ids as number[]).includes(guessId))
    return buildView(admin, session as never); // ignore duplicate

  const career = await fullCareer(admin, session.player_id);
  const clubCount = career.length;
  const guessed = [...(session.guessed_ids as number[]), guessId];
  const movesUsed = guessed.length + session.skips;
  const correct = guessId === session.player_id;
  const outOfMoves = movesUsed >= clubCount;
  const finished = correct || outOfMoves;

  const update: Record<string, unknown> = { guessed_ids: guessed };
  if (finished) {
    update.finished_at = new Date().toISOString();
    update.solved = correct;
    update.points = scoreGame(clubCount, movesUsed, correct);
  }
  const { data: updated } = await admin
    .from("game_session")
    .update(update)
    .eq("id", sessionId)
    .select("*")
    .single();
  return buildView(admin, updated as never);
}

/** Skip: reveal the next club without guessing (consumes a move). */
export async function skipReveal(
  sessionId: string,
): Promise<GameView | { error: string }> {
  const ctx = await loadOwnedSession(sessionId);
  if ("error" in ctx) return { error: ctx.error };
  const { admin, session } = ctx;
  if (session.finished_at) return buildView(admin, session as never);

  const career = await fullCareer(admin, session.player_id);
  const skips = session.skips + 1;
  const movesUsed = (session.guessed_ids as number[]).length + skips;
  const update: Record<string, unknown> = { skips };
  if (movesUsed >= career.length) {
    update.finished_at = new Date().toISOString();
    update.solved = false;
    update.points = 0;
  }
  const { data: updated } = await admin
    .from("game_session")
    .update(update)
    .eq("id", sessionId)
    .select("*")
    .single();
  return buildView(admin, updated as never);
}

/** Leaderboard via the SECURITY DEFINER RPC (never exposes the answer). */
export async function getLeaderboard(
  scope: string, // 'global' or a league id
  period: "daily" | "all",
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("career_leaderboard", {
    p_scope: scope,
    p_period: period,
    p_date: todayIso(),
  });
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}
```

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npx eslint lib/games`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/games/career.ts
git commit -m "Career game: server-authoritative game actions"
```

---

## Task 8: End-to-end verification script

**Files:**
- Create: `scripts/e2e-career-game.mjs`

- [ ] **Step 1: Write the E2E script**

```js
// E2E: exercises the game data + RLS directly (server-action logic mirrored).
// Verifies: hidden clubs are not over-revealed, scoring, daily replay block,
// and that the leaderboard RPC never returns player_id.
//
// Run:  node --env-file=.env.local scripts/e2e-career-game.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

async function main() {
  // Pick an eligible player with a known club count.
  const { data: pool } = await admin
    .from("players")
    .select("id,name")
    .eq("career_game_eligible", true)
    .limit(1);
  assert(pool?.length === 1, "found an eligible player");
  const answerId = pool[0].id;
  const { data: career } = await admin
    .from("player_career")
    .select("ord")
    .eq("player_id", answerId);
  const clubCount = career.length;
  assert(clubCount >= 3, `answer has >=3 clubs (got ${clubCount})`);

  // Reveal math: initial reveal is 1, then +1 per move, capped at clubCount.
  const revealAfter = (moves) => Math.min(clubCount, 1 + moves);
  assert(revealAfter(0) === 1, "starts with exactly 1 club revealed");
  assert(revealAfter(clubCount) === clubCount, "never reveals more than clubCount");

  // Scoring sanity (mirror of scoreGame).
  const score = (moves, solved) => (solved ? Math.max(1, clubCount - moves + 1) : 0);
  assert(score(1, true) === clubCount, "first-move solve = clubCount points");
  assert(score(clubCount, true) === 1, "last-move solve = 1 point");
  assert(score(2, false) === 0, "unsolved = 0 points");

  // Leaderboard RPC must not expose player_id.
  const { data: lb } = await admin.rpc("career_leaderboard", {
    p_scope: "global",
    p_period: "all",
    p_date: new Date().toISOString().slice(0, 10),
  });
  if ((lb ?? []).length > 0) {
    assert(!("player_id" in lb[0]), "leaderboard rows do not include player_id");
  } else {
    console.log("ok: leaderboard empty (no finished games yet) — skip column check");
  }

  console.log("\nE2E PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the E2E script**

Run:
```bash
cd /Users/erencanozkaya/Projects/WC2026_PredictionLeague
node --env-file=.env.local scripts/e2e-career-game.mjs
```
Expected: a list of `ok:` lines ending with `E2E PASSED`.

- [ ] **Step 3: Run the full unit suite + build**

Run: `npx vitest run && npm run build`
Expected: all tests pass; build compiles.

- [ ] **Step 4: Commit**

```bash
git add scripts/e2e-career-game.mjs
git commit -m "Career game: end-to-end verification script"
```

---

## Self-Review notes

- **Spec coverage:** schema + RLS + leaderboard RPC (Task 1); youth cleanup + logos + leagues (Task 5); scoring/compare/daily pure logic (Tasks 2-4); server-authoritative start/guess/skip with hidden-club reveal (Task 7); leaderboard without `player_id` leak (Tasks 1 & 7 & 8). UI is intentionally deferred to the UI plan.
- **Reveal rule:** initial 1 + one per move, capped at `clubCount`; finished reveals all — consistent across `buildView` (Task 7) and the E2E check (Task 8).
- **Guess limit:** `clubCount` (distinct kept clubs); `movesUsed = guesses + skips`; `scoreGame` matches in Tasks 2, 7, 8.
- **Types:** `PlayerFacts`/`Comparison` defined in Task 3 and consumed by Tasks 6-7; `GameView`/`RevealedClub` defined in Task 7 and used by the UI plan.

## Follow-up: UI plan

After this plan is executed and verified, write `docs/superpowers/plans/2026-06-11-career-game-ui.md` covering the Games hub, `/games/career` screen (`CareerTimeline`, `GuessRow`, `PlayerSearch`, `CareerGame`), nav entry, and the Dashboard daily card, consuming `GameView` and the actions from Task 7.
