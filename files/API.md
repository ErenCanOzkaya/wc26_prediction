# API.md — Data Provider Contract (football-data.org)

## Provider decision

**football-data.org**, free tier. Rationale: World Cup is covered on the free tier,
the rate limit is **10 requests/minute** (far friendlier for a live poller than
API-Football's 100 requests/day), and it provides fixtures, results, standings, and
scorers — everything v1 needs once fantasy is deferred.

**Known risk to verify at implementation time:** in-play (minute-by-minute) depth on
the free tier may be limited/delayed. Match-FINAL results are reliable and the
scoring engine depends only on those. "Live-ish" is achieved by polling during match
windows; if true live events aren't exposed, the app still works on finalized results.

## Golden rules

1. **Clients never call the provider.** Only server-side code (API routes + poller)
   holds the API key and talks to football-data.org.
2. **All provider data is cached into our own DB** (`matches`, `group_standings`,
   `bracket_slots`, `teams`, `players`, scorers). The UI reads from our DB only.
3. **Abstract everything behind one service module** (`lib/football.ts`) so the
   provider can be swapped (e.g. to API-Football or a paid tier for v2 fantasy)
   without touching app code.

## Env

```
FOOTBALL_DATA_API_KEY=...        # X-Auth-Token header
FOOTBALL_DATA_BASE=https://api.football-data.org/v4
WC_COMPETITION_CODE=WC           # VERIFY: confirm the 2026 code/id via /v4/competitions
```

> First implementation step: GET `/v4/competitions` and confirm the World Cup 2026
> competition code/id (historically `WC` / id 2000). Do not assume — print and verify.

## Endpoints used (v1)

| Need                 | Endpoint (under base)                              |
|----------------------|----------------------------------------------------|
| Fixtures + results   | `/competitions/{WC}/matches`                       |
| Group standings      | `/competitions/{WC}/standings`                     |
| Top scorers          | `/competitions/{WC}/scorers`                       |
| Teams                | `/competitions/{WC}/teams`                         |
| Single match (live)  | `/matches/{id}`                                    |

## Service interface (`lib/football.ts`)

```ts
export interface FootballProvider {
  getCompetition(): Promise<Competition>;
  getMatches(): Promise<ProviderMatch[]>;       // all fixtures + statuses + scores
  getStandings(): Promise<ProviderStanding[]>;  // 12 groups
  getScorers(limit?: number): Promise<ProviderScorer[]>;
  getTeams(): Promise<ProviderTeam[]>;
  getMatch(id: number): Promise<ProviderMatch>; // for tighter live polling
}
// Default export: footballDataProvider implements FootballProvider.
// Swap point for v2: apiFootballProvider implements the same interface.
```

The poller maps `ProviderMatch` → our `matches` rows, normalizes `status`
(`SCHEDULED|LIVE|IN_PLAY|PAUSED|FINISHED|POSTPONED` → our `match_status`), and sets
`winner_team_id` (post-penalties for knockout).

## Poller design

A scheduled server job (Vercel Cron or Supabase scheduled function). Two cadences:

- **Live window** (any match `LIVE`/`IN_PLAY`): poll every 30–60s. With ≤ a handful
  of concurrent matches this stays well under 10 req/min.
- **Idle:** poll fixtures/standings hourly; scorers a few times a day.

After each poll:
1. Upsert changed `matches` rows.
2. On a match transition to `finished`, trigger the scoring engine for that match.
3. On the last group match finishing, refresh `group_standings` + resolve
   `bracket_slots`, then run group + bracket scoring.

Rate-budget sanity: 10 req/min × 60 = 600/hr is ample. Live polling a few matches at
60s is ~3–6 req/min. No paid tier needed for v1.

## Fallback / secondary source

A free open-source community API exists (github.com/rezarahiminia/worldcup2026, no
key, claims live updates during the tournament). Treat as an **optional secondary**
behind the same `FootballProvider` interface — useful for cross-checking live scores,
not as the primary of record given unknown reliability.
