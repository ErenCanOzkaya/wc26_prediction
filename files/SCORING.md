# SCORING.md — Point Economy & Scoring Engine

All coefficients live in a single config object (`SCORING_CONFIG`, §6). Never
hardcode numbers in business logic — read them from config so they can be tuned.

The scoring engine must be **deterministic and idempotent**: given the same
results, recomputing produces the same scores. It must be safe to re-run (replay)
after a data correction. Recompute on each match/stage finalization.

## Design philosophy

Reward both **engagement** (daily match predictions keep everyone in the race) and
**long-term insight** (bracket + champion carry high-variance upside that can win
the league on its own). Group + match grind should not trivialize the dramatic
late-stage picks.

---

## 1. Match prediction (per match — group AND knockout)

Resolved from final score. For knockout matches, the recorded result is the score
at the end of normal/extra time; the post-penalty winner determines the outcome
(see §5 edge cases).

| Outcome of prediction                                          | Points |
|----------------------------------------------------------------|:------:|
| Exact score                                                    | 5      |
| Correct result + correct goal margin, wrong score (e.g. 2-0 → 3-1) | 3   |
| Correct draw, wrong score                                      | 3      |
| Correct winner only, wrong margin/score                        | 2      |
| Wrong                                                          | 0      |

Take the **single highest** matching tier (not additive).

**Optional "perfect matchday" bonus:** if a user correctly calls the outcome
(W/D/L) of *every* match on a given calendar day they predicted, award `+5`.
Toggle via config (`perfectMatchdayBonus`).

## 2. Group standings (per group, ×12)

Resolved from the final group table (apply official tiebreakers, §5).

| Condition                                                  | Points |
|------------------------------------------------------------|:------:|
| Each team placed in its exact final position               | +2 each (max 8) |
| Correct set of the 2 direct qualifiers (top 2), order-agnostic | +3 |
| Perfect group (all 4 in exact order)                       | +4 bonus |

Max 15 per group. The 8-best-third-placed mechanic is intentionally NOT scored
here (it's a cross-group computation that confuses users); who advances is
captured by the bracket module instead.

## 3. Knockout bracket

Predicted after the group stage with **one edit window** (see DESIGN §6). Slot
bonuses are computed only against the post-update bracket.

For each team, award the "reached this stage" base points if the user predicted
that team to reach **at least** that stage. Add the slot bonus if the team
reached it via the **exact predicted bracket slot/path**.

| Stage reached        | Base | Slot bonus |
|----------------------|:----:|:----------:|
| Round of 32 (qualified from group) | 1 | — |
| Round of 16          | 3    | +1         |
| Quarter-final        | 6    | +2         |
| Semi-final           | 10   | +3         |
| Final                | 16   | +4         |
| Champion             | 30   | +5         |

A perfect bracket is ~287 pts by design — the league's crown-jewel category.
Realistically a strong bracket yields ~80–120, which balances the group+match grind.

## 4. Tournament specials

Locked at tournament opening kickoff.

| Special                          | Points | Resolution      |
|----------------------------------|:------:|-----------------|
| Golden Boot (top scorer)         | +15    | API scorers feed |
| Best Player (optional)           | +10    | Admin, manual at end |
| Best Young Player ≤21 (optional) | +10    | Admin, manual at end |

"Optional" specials are awarded by voting and have no clean API field; the league
admin resolves them manually at tournament end. Best Young Player eligibility:
age ≤ 21 **at tournament start (11 June 2026)**; 22+ players are ineligible.

---

## 5. Resolution algorithm & edge cases

**General flow** (run on each finalization event):
1. Pull finalized data from our DB (results / standings / bracket progression).
2. For each affected prediction, compute its category score from config.
3. Upsert into `scores` (idempotent: keyed by user + prediction unit).
4. League leaderboards = SUM of a member's `scores`, ranked.

**Edge cases:**
- **Penalty shootouts (knockout):** record the 90'/120' score for match scoring;
  the *advancing team* (post-penalties) is the "winner/outcome" and drives bracket
  resolution. A score prediction of e.g. 1-1 that went to pens is an exact-score 5
  if the recorded score was 1-1; the outcome for bracket purposes is the team that
  won on penalties.
- **Group tiebreakers:** resolve final positions using the official order (GD →
  goals scored → head-to-head → fair play → drawing of lots). Prefer the standings
  the API returns; fall back to computing GD/goals if needed.
- **Abandoned / rescheduled matches:** score only against the official final result;
  if void, that match scores 0 for everyone and is excluded from any matchday bonus.
- **Late predictions:** rejected at the API layer by the lock rules — the engine
  never sees a prediction past its lock, but it must still defensively ignore any
  prediction whose `created_at`/`updated_at` is after its lock timestamp.
- **Bracket update window:** only the latest bracket submission before the R32 lock
  counts. Slot bonuses use that version.
- **Idempotency:** re-running the engine must overwrite, not duplicate, prior scores.

---

## 6. SCORING_CONFIG (single source of tunable values)

```json
{
  "match": {
    "exactScore": 5,
    "correctResultAndMargin": 3,
    "correctDraw": 3,
    "correctWinnerOnly": 2,
    "perfectMatchdayBonus": 5,
    "perfectMatchdayBonusEnabled": true
  },
  "group": {
    "exactPositionPerTeam": 2,
    "correctTop2Set": 3,
    "perfectGroupBonus": 4
  },
  "bracket": {
    "r32":   { "base": 1,  "slotBonus": 0 },
    "r16":   { "base": 3,  "slotBonus": 1 },
    "qf":    { "base": 6,  "slotBonus": 2 },
    "sf":    { "base": 10, "slotBonus": 3 },
    "final": { "base": 16, "slotBonus": 4 },
    "champion": { "base": 30, "slotBonus": 5 }
  },
  "specials": {
    "goldenBoot": 15,
    "bestPlayer": 10,
    "bestYoungPlayer": 10,
    "youngPlayerMaxAge": 21,
    "tournamentStartDate": "2026-06-11"
  }
}
```

Coefficients to revisit after a test run: `bracket.champion.base` (is 30 too
light/heavy vs the group+match grind?) and `group.exactPositionPerTeam`.
