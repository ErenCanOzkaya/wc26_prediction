# Career-Path Game — UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the player-facing UI for the career-path guessing game — the game screen (progressive club timeline, attribute-comparison guesses, count-up timer), a Games hub with leaderboards, a nav entry, and a Dashboard daily card — consuming the backend from `lib/games/career.ts`.

**Architecture:** Server pages load the initial `GameView` (and the WC player/team lists) and hand them to a `CareerGame` client orchestrator that calls the existing server actions (`startCareerGame`, `submitGuess`, `skipReveal`) and re-renders from each returned `GameView`. Presentational components (`CareerTimeline`, `GuessRow`, `PlayerSearch`) are dumb and reusable. Leaderboards call `getLeaderboard`.

**Tech Stack:** Next.js App Router (server + client components), Tailwind v4 design system already in `app/globals.css` (`.surface`, `.field`, `.btn`, `.pill`, colour tokens `text-fg/muted/green/red`, display font), server actions from Task-7 backend.

This plan depends on the backend plan (`2026-06-11-career-game-backend.md`) being complete on the same branch (`career-game`). It produces software verified by `npm run build` + `npx eslint` + manual play. The project has no React component test harness, so UI tasks verify via build/lint (consistent with all existing components, none of which are unit-tested).

---

## Reference (the target UX, in our design language)

- A mystery timeline of **club crests in circles** with the join year under each; unrevealed future clubs show a grey **"?"** circle; loan spells get a small **"Loan"** badge.
- A **search box** to guess a player (autocomplete over the WC squads, diacritic-insensitive).
- Each guess appears as a row: the guessed player's name + comparison chips — **nationality flag, league, current club, position, age (with ↑/↓)** — each **green when it matches the answer, red when not**.
- A row of **move dots** (filled per move) and a **Skip** button; a **count-up timer** top-right (display only).
- On finish: reveal the **name + flag + full timeline + points**, with **Play next** (practice) and a peek at the **leaderboard** (daily) — all in our dark `#16191d` / green-navy-red palette with the `26` motif.

## Data shapes (from the backend, do not redefine — import them)

From `lib/games/career.ts`:
```ts
GameView { sessionId, mode: "daily"|"practice", clubCount, revealed: RevealedClub[],
           guesses: { playerId, name, comparison: Comparison }[], movesUsed,
           finished, solved, points, answer?: { name, nationality } | null }
RevealedClub { club, clubLogoUrl, startYear, endYear, isLoan }
```
From `lib/games/compare.ts`: `Comparison { nationality, league, currentClub, age, position }`, each a `Chip { value, match, direction? }`.

The `nationality`/`currentClub` chip values are **names** (strings). The client maps a country name → national-team crest via a `crests` map passed from the page (so the flag image can render). League and club are shown as text pills.

---

## File Structure

- `components/games/PlayerSearch.tsx` — autocomplete search (client) (Create).
- `components/games/CareerTimeline.tsx` — club-crest timeline (presentational) (Create).
- `components/games/GuessRow.tsx` — one guess + comparison chips (presentational) (Create).
- `components/games/CareerGame.tsx` — client orchestrator: state, timer, server-action calls (Create).
- `components/games/CareerLeaderboard.tsx` — leaderboard with scope/period toggles (client) (Create).
- `app/(app)/games/career/page.tsx` — game screen server page (Create).
- `app/(app)/games/page.tsx` — Games hub (Create).
- `components/AppHeader.tsx` — add the "Games" nav link (Modify).
- `app/(app)/page.tsx` — add the Dashboard daily card (Modify).

---

## Task 1: `PlayerSearch` (autocomplete)

**Files:**
- Create: `components/games/PlayerSearch.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useMemo, useState } from "react";
import { matches } from "@/lib/text";

export interface SearchPlayer {
  id: number;
  name: string;
}

export function PlayerSearch({
  players,
  exclude,
  disabled,
  onPick,
}: {
  players: SearchPlayer[];
  exclude: number[];
  disabled?: boolean;
  onPick: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const excludeSet = useMemo(() => new Set(exclude), [exclude]);
  const results = useMemo(
    () =>
      q.trim().length < 2
        ? []
        : players
            .filter((p) => !excludeSet.has(p.id) && matches(p.name, q))
            .slice(0, 8),
    [q, players, excludeSet],
  );

  return (
    <div className="relative">
      <input
        className="field w-full"
        placeholder="Search for player"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-black/90 backdrop-blur">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-sm hover:bg-white/8"
                onClick={() => {
                  onPick(p.id);
                  setQ("");
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npx eslint components/games/PlayerSearch.tsx`
Expected: compiles, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/PlayerSearch.tsx
git commit -m "Career game UI: player search autocomplete"
```

---

## Task 2: `CareerTimeline` (club-crest timeline)

**Files:**
- Create: `components/games/CareerTimeline.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { RevealedClub } from "@/lib/games/career";

/** Shows revealed clubs as crest circles + year; hidden future clubs as "?". */
export function CareerTimeline({
  revealed,
  clubCount,
}: {
  revealed: RevealedClub[];
  clubCount: number;
}) {
  const hidden = Math.max(0, clubCount - revealed.length);
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-2 gap-y-4">
      {revealed.map((c, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/8">
            {c.isLoan && (
              <span className="absolute -top-2 rounded bg-sand px-1 text-[9px] font-bold text-bg">
                Loan
              </span>
            )}
            {c.clubLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.clubLogoUrl} alt={c.club} className="h-9 w-9 object-contain" />
            ) : (
              <span className="px-1 text-center text-[9px] leading-tight text-muted">
                {c.club}
              </span>
            )}
          </div>
          <span className="display text-xs">{c.startYear ?? "?"}</span>
        </div>
      ))}
      {Array.from({ length: hidden }).map((_, i) => (
        <div key={`h${i}`} className="flex flex-col items-center gap-1">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-xl font-bold text-muted">
            ?
          </div>
          <span className="display text-xs text-muted">·</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npx eslint components/games/CareerTimeline.tsx`
Expected: compiles, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/CareerTimeline.tsx
git commit -m "Career game UI: club-crest timeline"
```

---

## Task 3: `GuessRow` (comparison chips)

**Files:**
- Create: `components/games/GuessRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { Comparison, Chip } from "@/lib/games/compare";

function ChipBox({
  chip,
  children,
}: {
  chip: Chip;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex h-9 min-w-9 items-center justify-center gap-0.5 rounded-full px-2 text-[10px] font-bold uppercase ${
        chip.match ? "bg-green/25 text-green" : "bg-red/20 text-red"
      }`}
    >
      {children}
    </span>
  );
}

/** One guessed player with the five comparison chips. */
export function GuessRow({
  name,
  comparison,
  crests,
}: {
  name: string;
  comparison: Comparison;
  crests: Record<string, string>;
}) {
  const nat = String(comparison.nationality.value ?? "");
  const crest = crests[nat];
  return (
    <div className="surface flex items-center gap-2 p-2">
      <span className="flex-1 truncate pl-1 text-sm font-bold">{name}</span>
      <ChipBox chip={comparison.nationality}>
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={crest} alt={nat} className="h-4 w-4 rounded-full object-cover" />
        ) : (
          nat.slice(0, 3)
        )}
      </ChipBox>
      <ChipBox chip={comparison.league}>
        {String(comparison.league.value ?? "—").slice(0, 4)}
      </ChipBox>
      <ChipBox chip={comparison.currentClub}>
        {String(comparison.currentClub.value ?? "—").slice(0, 4)}
      </ChipBox>
      <ChipBox chip={comparison.position}>{String(comparison.position.value ?? "")}</ChipBox>
      <ChipBox chip={comparison.age}>
        {comparison.age.value}
        {comparison.age.direction === "up" ? "↑" : comparison.age.direction === "down" ? "↓" : ""}
      </ChipBox>
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npx eslint components/games/GuessRow.tsx`
Expected: compiles, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/GuessRow.tsx
git commit -m "Career game UI: guess row with comparison chips"
```

---

## Task 4: `CareerGame` (client orchestrator)

**Files:**
- Create: `components/games/CareerGame.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  submitGuess,
  skipReveal,
  startCareerGame,
  type GameView,
} from "@/lib/games/career";
import { CareerTimeline } from "./CareerTimeline";
import { GuessRow } from "./GuessRow";
import { PlayerSearch, type SearchPlayer } from "./PlayerSearch";

function Timer({ running }: { running: boolean }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="display text-lg tabular-nums">{mm}:{ss}</span>;
}

export function CareerGame({
  initial,
  players,
  crests,
}: {
  initial: GameView;
  players: SearchPlayer[];
  crests: Record<string, string>;
}) {
  const [view, setView] = useState<GameView>(initial);
  const [busy, setBusy] = useState(false);
  const guessedIds = useRef<number[]>(view.guesses.map((g) => g.playerId));

  const apply = (next: GameView | { error: string }) => {
    if ("error" in next) return;
    guessedIds.current = next.guesses.map((g) => g.playerId);
    setView(next);
  };

  const onPick = async (id: number) => {
    if (busy || view.finished) return;
    setBusy(true);
    apply(await submitGuess(view.sessionId, id));
    setBusy(false);
  };
  const onSkip = async () => {
    if (busy || view.finished) return;
    setBusy(true);
    apply(await skipReveal(view.sessionId));
    setBusy(false);
  };
  const onNext = async () => {
    setBusy(true);
    apply(await startCareerGame("practice"));
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
          {view.mode === "daily" ? "Daily puzzle" : "Practice"}
        </span>
        <Timer running={!view.finished} />
      </div>

      {view.finished && view.answer && (
        <div className="surface mb-4 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-muted">
            {view.solved ? "Solved 🎉" : "The player was"}
          </p>
          <p className="display mt-1 text-3xl">{view.answer.name}</p>
          <p className="mt-1 text-sm text-muted">{view.answer.nationality}</p>
          <p className="mt-3 display text-2xl text-green">+{view.points}</p>
        </div>
      )}

      <CareerTimeline revealed={view.revealed} clubCount={view.clubCount} />

      <div className="mt-5 flex items-center justify-center gap-1.5">
        {Array.from({ length: view.clubCount }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${
              i < view.movesUsed ? "bg-red" : "bg-white/15"
            }`}
          />
        ))}
      </div>

      {!view.finished ? (
        <div className="mt-5 space-y-3">
          <PlayerSearch
            players={players}
            exclude={guessedIds.current}
            disabled={busy}
            onPick={onPick}
          />
          <div className="text-center">
            <button
              type="button"
              className="btn"
              onClick={onSkip}
              disabled={busy}
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-3">
          {view.mode === "practice" ? (
            <button type="button" className="btn" onClick={onNext} disabled={busy}>
              Play next
            </button>
          ) : (
            <Link href="/games" className="btn">
              See leaderboard
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        {[...view.guesses].reverse().map((g) => (
          <GuessRow
            key={g.playerId}
            name={g.name}
            comparison={g.comparison}
            crests={crests}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npx eslint components/games/CareerGame.tsx`
Expected: compiles, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add components/games/CareerGame.tsx
git commit -m "Career game UI: client orchestrator"
```

---

## Task 5: Game screen page `/games/career`

**Files:**
- Create: `app/(app)/games/career/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startCareerGame } from "@/lib/games/career";
import { CareerGame } from "@/components/games/CareerGame";
import type { SearchPlayer } from "@/components/games/PlayerSearch";

export const dynamic = "force-dynamic";

export default async function CareerGamePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const gameMode = mode === "practice" ? "practice" : "daily";

  const view = await startCareerGame(gameMode);
  if ("error" in view) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm text-muted">{view.error}</p>
        <Link href="/games" className="mt-3 inline-block text-green">
          ← Games
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  // Guessable universe = all WC players (paginate past the 1000-row cap).
  const players: SearchPlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("players")
      .select("id,name")
      .order("name")
      .range(from, from + 999);
    if (!data?.length) break;
    players.push(...(data as SearchPlayer[]));
    if (data.length < 1000) break;
  }
  // Country name -> national-team crest, for the nationality chip flag.
  const { data: teams } = await supabase.from("teams").select("name,crest_url");
  const crests: Record<string, string> = {};
  for (const t of teams ?? [])
    if (t.crest_url) crests[t.name as string] = t.crest_url as string;

  return (
    <div>
      <Link href="/games" className="text-sm text-muted hover:text-fg">
        ← Games
      </Link>
      <div className="mt-3">
        <CareerGame initial={view} players={players} crests={crests} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + lint**

Run: `npm run build && npx eslint "app/(app)/games/career/page.tsx"`
Expected: compiles, no lint errors. (Note: building does not run the page; runtime needs migration 0009 + eligible players, already in place on this branch's database.)

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/games/career/page.tsx"
git commit -m "Career game UI: game screen page"
```

---

## Task 6: Games hub `/games` + leaderboard

**Files:**
- Create: `components/games/CareerLeaderboard.tsx`
- Create: `app/(app)/games/page.tsx`

- [ ] **Step 1: Write the leaderboard component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { getLeaderboard } from "@/lib/games/career";

interface Row {
  display_name: string;
  points: number;
  time_ms: number;
  games: number;
  solved: number;
}

export function CareerLeaderboard({
  leagues,
}: {
  leagues: { id: string; name: string }[];
}) {
  const [period, setPeriod] = useState<"daily" | "all">("daily");
  const [scope, setScope] = useState<string>("global");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    getLeaderboard(scope, period).then((res) => {
      if (alive && "rows" in res) setRows(res.rows as Row[]);
    });
    return () => {
      alive = false;
    };
  }, [scope, period]);

  return (
    <div className="surface p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {(["daily", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`pill ${period === p ? "bg-green/25 text-green" : ""}`}
          >
            {p === "daily" ? "Today" : "All-time"}
          </button>
        ))}
        <span className="mx-1 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => setScope("global")}
          className={`pill ${scope === "global" ? "bg-green/25 text-green" : ""}`}
        >
          Global
        </button>
        {leagues.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setScope(l.id)}
            className={`pill ${scope === l.id ? "bg-green/25 text-green" : ""}`}
          >
            {l.name}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No scores yet.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.display_name} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-right text-muted">{i + 1}</span>
              <span className="flex-1 truncate font-bold">{r.display_name}</span>
              <span className="text-xs text-muted">{r.solved}/{r.games}</span>
              <span className="display w-12 text-right text-green">{r.points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the hub page**

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Motif26 } from "@/components/Motif26";
import { CareerLeaderboard } from "@/components/games/CareerLeaderboard";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: todaySession }, { data: leagues }] = await Promise.all([
    supabase
      .from("game_session")
      .select("solved,points,finished_at")
      .eq("user_id", user!.id)
      .eq("mode", "daily")
      .eq("puzzle_date", today)
      .maybeSingle(),
    supabase.from("leagues").select("id,name"),
  ]);
  const played = todaySession?.finished_at != null;

  return (
    <div className="space-y-6">
      <h1 className="display rise text-6xl leading-[0.9] sm:text-7xl">
        THE
        <br />
        <span className="text-green">GAMES</span>
      </h1>

      <section className="grid gap-3 md:grid-cols-2">
        <Link
          href="/games/career?mode=daily"
          className="surface surface-hover rise group relative overflow-hidden p-6"
        >
          <Motif26 className="absolute -bottom-10 -right-6 scale-90 opacity-30 transition group-hover:opacity-60" />
          <h2 className="display text-3xl">Career Path</h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Guess the mystery player from their club career. Fewer guesses, more
            points.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-green">
            {played
              ? todaySession?.solved
                ? `Today: solved · +${todaySession.points} →`
                : "Today: played →"
              : "Play today's puzzle →"}
          </span>
        </Link>
        <Link
          href="/games/career?mode=practice"
          className="surface surface-hover rise flex flex-col justify-center p-6"
        >
          <h2 className="display text-2xl">Practice</h2>
          <p className="mt-2 text-sm text-muted">
            Endless random players. Doesn’t count for the daily leaderboard.
          </p>
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Leaderboard
        </h2>
        <CareerLeaderboard leagues={(leagues ?? []) as { id: string; name: string }[]} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Build + lint**

Run: `npm run build && npx eslint components/games/CareerLeaderboard.tsx "app/(app)/games/page.tsx"`
Expected: compiles, no lint errors.

- [ ] **Step 4: Commit**

```bash
git add components/games/CareerLeaderboard.tsx "app/(app)/games/page.tsx"
git commit -m "Career game UI: games hub + leaderboard"
```

---

## Task 7: Add "Games" to the nav

**Files:**
- Modify: `components/AppHeader.tsx`

- [ ] **Step 1: Find the nav links**

Run: `grep -n "Calendar\|Rules\|href=\"/leagues\"\|NavLink\|nav" components/AppHeader.tsx`
This locates the inline nav link list (Dashboard / Predictions / Leagues / Calendar / Rules).

- [ ] **Step 2: Add a Games link**

Insert a `Games` entry pointing to `/games`, immediately after the `Calendar` link, matching the exact markup of the sibling links. For example, if the existing links render as:
```tsx
<Link href="/calendar" className={navClass("/calendar")}>Calendar</Link>
```
then add directly after it:
```tsx
<Link href="/games" className={navClass("/games")}>Games</Link>
```
Use whatever class/active-state helper the existing links use (copy a sibling link exactly and change `href` + label). Do not invent new styling.

- [ ] **Step 3: Build + lint**

Run: `npm run build && npx eslint components/AppHeader.tsx`
Expected: compiles, no lint errors; "Games" appears in the header nav.

- [ ] **Step 4: Commit**

```bash
git add components/AppHeader.tsx
git commit -m "Career game UI: Games nav link"
```

---

## Task 8: Dashboard daily card

**Files:**
- Modify: `app/(app)/page.tsx`

- [ ] **Step 1: Load today's daily-game status**

In `DashboardPage`, alongside the existing queries, add a fetch for the user's daily session. Add this inside the existing `Promise.all` array (it already destructures `profile`, `myScores`, `leagues`):
```tsx
      supabase
        .from("game_session")
        .select("solved,points,finished_at")
        .eq("user_id", user!.id)
        .eq("mode", "daily")
        .eq("puzzle_date", new Date().toISOString().slice(0, 10))
        .maybeSingle(),
```
Update the destructuring to capture it, e.g.:
```tsx
  const [{ data: profile }, { data: myScores }, { data: leagues }, { data: dailyGame }] =
    await Promise.all([
```

- [ ] **Step 2: Add the card to the action grid**

Inside the right-hand `<div className="flex flex-col gap-3">` of the action grid (the column that holds "Next kickoff" and "your leagues"), add a third card after the leagues link:
```tsx
          <Link
            href="/games/career?mode=daily"
            className="surface surface-hover rise flex items-center justify-between p-5"
            style={{ animationDelay: "380ms" }}
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted">
                Daily puzzle
              </div>
              <div className="mt-1 text-sm">
                {dailyGame?.finished_at
                  ? dailyGame.solved
                    ? `Solved · +${dailyGame.points}`
                    : "Played today"
                  : "Guess the career path"}
              </div>
            </div>
            <span className="text-sm font-bold text-green">→</span>
          </Link>
```

- [ ] **Step 3: Build + lint**

Run: `npm run build && npx eslint "app/(app)/page.tsx"`
Expected: compiles, no lint errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/page.tsx"
git commit -m "Career game UI: dashboard daily card"
```

---

## Task 9: Manual play-through + final checks

**Files:** none (verification only)

- [ ] **Step 1: Full build + lint + tests**

Run: `npx vitest run && npm run build && npx eslint`
Expected: all tests pass, build compiles, eslint clean.

- [ ] **Step 2: Manual play-through (human, on the running dev server)**

Start `npm run dev`, sign in, then verify:
- `/games` shows the Career Path + Practice cards and the leaderboard toggles.
- `/games/career` (daily): starts with 1 club revealed; a guess adds a row with green/red chips and reveals one more club; the move dots fill; Skip reveals without a guess; solving (or exhausting moves) reveals the answer + points; reloading shows the finished result (daily can't be replayed).
- Practice mode: "Play next" loads a fresh player.
- Dashboard shows the Daily puzzle card with the right status.

- [ ] **Step 3: Commit any fixes from the play-through, then report for branch finish**

After the play-through passes (and any visual fixes are committed), the feature is complete on `career-game`. Proceed to `superpowers:finishing-a-development-branch` to merge the whole career-game feature (backend + UI) into `main`.

---

## Self-Review notes

- **Spec coverage:** game screen with progressive timeline + chips + count-up timer (Tasks 2-5); search constrained to WC players (Task 1); Games hub + daily/all-time × league/global leaderboard (Task 6); nav entry (Task 7); Dashboard daily card (Task 8). Daily-replay and answer-hiding are enforced by the backend and surfaced read-only here.
- **Type reuse:** `GameView`/`RevealedClub` imported from `lib/games/career.ts`; `Comparison`/`Chip` from `lib/games/compare.ts`; `SearchPlayer` defined once in `PlayerSearch` and imported by the page and orchestrator. No redefinitions.
- **Data gaps handled:** nationality flag via the page's `crests` name→crest map; league/club shown as text pills (we store names, not logos for those chips); no player face photo — the reveal uses name + nationality + timeline, per the spec.
- **Verification:** UI tasks use build/lint (the project has no component-test harness); the backend logic was unit-tested in the backend plan; a human play-through is the final gate before merge.
