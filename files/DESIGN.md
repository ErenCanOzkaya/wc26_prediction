# DESIGN.md — World Cup 2026 Prediction League

Working name: **wc26-league** (rename freely)

A web app where a user enters predictions for the 2026 FIFA World Cup and competes
with friends inside one or more private leagues. This document is the single source
of product + architecture truth. Companion files:

- `SCORING.md` — exact point economy + deterministic scoring engine spec
- `SCHEMA.sql` — Postgres / Supabase schema
- `API.md` — football-data.org integration contract + poller design

---

## 1. Tournament facts (do NOT hardcode the old 32-team format)

The 2026 format is new. Build against these, not previous tournaments:

- **48 teams**, **12 groups of 4** (Groups A–L).
- Group stage: each team plays 3 matches. **72 group matches.**
- Advancement: **top 2 of each group + the 8 best 3rd-placed teams** → 32 teams.
- Knockout rounds, in order: **Round of 32 → Round of 16 → Quarter-final →
  Semi-final → Third-place play-off → Final.** (Round of 32 is new vs older editions.)
- **104 matches total.** Do not hardcode this; some feeds publish the 72 group
  fixtures first and add knockout rows as they resolve.
- Dates: **11 June – 19 July 2026.** Hosts: USA, Canada, Mexico. Final at MetLife
  Stadium (New York / New Jersey).
- Group tiebreakers (in order): goal difference, goals scored, head-to-head,
  fair-play ranking, drawing of lots.
- R32 matchups depend on **which** groups the 8 third-placed teams come from
  (a lookup that only resolves once the group stage ends). This is why bracket
  predictions get one update window after groups (see §6).

## 2. Tech stack & rationale

- **Next.js (App Router, TypeScript)** — frontend + API routes. API routes hide
  the football data API key and act as the only place that talks to the provider.
- **Supabase** — Postgres + Auth + Realtime. Postgres fits the relational scoring /
  leaderboard queries; Realtime drives live leaderboard updates; Auth handles login.
- **Tailwind CSS** for styling.
- **football-data.org** as the data provider (free tier). See `API.md`.
- **Server-side poller** (Vercel Cron or Supabase scheduled function) writes results
  into our DB. Clients NEVER call the provider directly.
- `.ics` generation for calendar export (no calendar OAuth needed).

## 3. Information architecture / screens

1. **Auth** — sign up / sign in (Supabase magic link or Google).
2. **Home / Dashboard** — countdown timer (top-right, see §8), your rank in each
   league, today's matches, open prediction deadlines, recent results.
3. **Predictions**
   - Group standings (12 groups, drag-to-order the 4 teams per group).
   - Match predictions (score entry per upcoming match).
   - Bracket (R32 → Final, fill the path; editable in the one update window).
   - Tournament specials (Golden Boot pick, optional awards).
4. **Leagues** — list of leagues you're in, create league, join via invite code,
   per-league leaderboard, league detail (members + standings + breakdown).
5. **Calendar** — full fixture calendar; mark "I'll watch", export `.ics`.
6. **Match detail** — lineups if available, live-ish score, your prediction vs result,
   points earned.
7. **Profile / settings.**

## 4. Multi-league model (important)

A user makes **one global prediction set.** Leagues are **leaderboard groupings**
over those same predictions — you compete with identical predictions across every
league you belong to. This makes multi-league trivial and scalable: predictions are
never duplicated per league.

- `predictions` are owned by the user, league-independent.
- A league leaderboard = sum of that user's category scores, ranked among members.
- Creating a league generates an invite code; joining adds a `league_members` row.

(Per-league *different* predictions is intentionally NOT supported in v1 — it
encourages hedging and roughly doubles the data model. Revisit later if asked.)

## 5. Calendar feature (in MVP)

- Calendar view of all fixtures (grouped by date, filterable by group / stage / team).
- "I'll watch" toggle per match (stored per user).
- Export: generate a downloadable `.ics` per match (or a combined `.ics` of all
  watched matches). Title, venue, kickoff (with correct timezone), and a reminder
  alarm. Works on iOS and Google Calendar without OAuth.

## 6. Prediction locking rules

| Prediction type      | Locks at                                        |
|----------------------|-------------------------------------------------|
| Group standings      | First kickoff of THAT group (staggered, per-group) |
| Match score          | That match's kickoff                            |
| Bracket              | First R32 kickoff; ONE edit allowed after group stage ends |
| Tournament specials  | Tournament opening kickoff                       |

Locking is enforced server-side. A prediction submitted/edited after its lock is
rejected. Surface deadlines clearly in the UI.

## 7. MVP scope & phases

**In MVP:** auth, group/match/bracket/specials predictions, multi-league +
leaderboards, results poller, deterministic scoring engine, calendar + `.ics`,
countdown timer, retro theme.

**Deferred to v2:** Fantasy mode (daily player picks). It needs granular per-player
match stats that the free data tier does not reliably provide — keep the data layer
abstracted (see `API.md`) so swapping providers later is a 1–2 day job.

Suggested build order:
1. Scaffold (Next.js + Supabase + Tailwind), auth, `SCHEMA.sql` applied.
2. Data layer: `lib/football.ts` + poller writing fixtures/results/standings to DB.
3. Predictions UI + server-side locking.
4. Scoring engine (config-driven, idempotent) + leaderboards.
5. Leagues (create/join/invite) + per-league ranking.
6. Calendar + `.ics`.
7. Theme pass + countdown timer + polish.

## 8. Theme & design direction

Reference: the **retro 70s** language (cream/off-white base; muted red, navy, green,
black; multi-line "racing-stripe" outline numerals; trophy in negative space), NOT
the official psychedelic Unify/Amplify patterns. Aim: clean, retro, minimal, lots of
whitespace, one bold condensed display typeface for headers + a neutral sans for body.

Palette (starting point — refine in `tailwind.config`):
- Cream / paper: `#F3E9D2`
- Black: `#111111`
- Retro red: `#C8442E`
- Retro navy: `#2A3B7A`
- Retro green: `#2E6B45`

**Countdown timer** (top-right, persistent): time remaining until the next
relevant kickoff (or tournament start before it begins). Styled like the WC logo —
a fat, rounded display font, hours and minutes stacked vertically. Updates live.

## 9. Out of scope for v1

Fantasy mode, real-money anything, public/global leagues, mobile native app,
push notifications, in-app chat.
