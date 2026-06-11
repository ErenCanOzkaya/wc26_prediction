# wc26-league

Predict 2026 FIFA World Cup outcomes and compete with friends in private leagues.

**Stack:** Next.js (App Router, TS) · Supabase (Postgres + Auth + Realtime) ·
Tailwind CSS · football-data.org (free tier) as the data provider.

Product/architecture truth lives in `files/`: `DESIGN.md`, `SCORING.md`,
`SCHEMA.sql`, `API.md`. The applied DB schema (with completed RLS) is
`supabase/schema.sql`.

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Supabase project**
   - Create a project at supabase.com.
   - SQL editor → run `supabase/schema.sql`.
   - Auth → enable Email (magic link). Optionally configure the Google provider.
   - Add `${SITE_URL}/auth/callback` to Auth → URL Configuration → Redirect URLs.

3. **Environment** — copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API)
   - `FOOTBALL_DATA_API_KEY` (football-data.org account)

4. **Run**
   ```bash
   npm run dev
   ```
   Unauthenticated visits redirect to `/login`. Sign in via magic link → land on
   the dashboard.

## Provider notes (verified)

- FIFA World Cup competition: **code `WC`, id `2000`**, season
  **2026-06-11 → 2026-07-19**. Available on the free tier.
- Free-tier rate limit: **10 req/min**.
- Free tier exposes fixtures, standings, scorers, teams and final scores. It does
  **not** expose lineups or minute-by-minute in-play events; "live-ish" is polled
  status + score during match windows. The scoring engine only needs finalized
  results.

## Architecture rules (enforced)

- Clients never call the provider. Only server code holds the API key; everything
  is cached into our DB behind `lib/football.ts` (added in Phase 2).
- Predictions are user-owned and league-independent; leagues are leaderboard
  groupings over the same predictions.
- Scoring is config-driven, deterministic and idempotent (Phase 4).
