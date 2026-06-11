import { SCORING_CONFIG, type ScoringConfig } from "./config";
import { BRACKET, type BracketMatch } from "@/lib/bracket/structure";

export interface Score {
  home: number;
  away: number;
}

/** 1 = home win, -1 = away win, 0 = draw. */
const outcome = (s: Score): number => Math.sign(s.home - s.away);

/**
 * Score a single match prediction against the final result (SCORING §1).
 * Returns the single highest matching tier (not additive).
 */
export function scoreMatch(
  pred: Score,
  result: Score,
  cfg: ScoringConfig = SCORING_CONFIG,
): number {
  const m = cfg.match;
  if (pred.home === result.home && pred.away === result.away) {
    return m.exactScore;
  }
  const po = outcome(pred);
  const ro = outcome(result);
  if (po !== ro) return 0;
  if (ro === 0) return m.correctDraw; // both draws, wrong scoreline
  if (pred.home - pred.away === result.home - result.away) {
    return m.correctResultAndMargin;
  }
  return m.correctWinnerOnly;
}

/**
 * Perfect-matchday bonus (SCORING §1): if the user correctly called the W/D/L
 * outcome of EVERY match they predicted on a calendar day, award the bonus.
 */
export function perfectMatchdayBonus(
  dayPredictions: { pred: Score; result: Score }[],
  cfg: ScoringConfig = SCORING_CONFIG,
): number {
  if (!cfg.match.perfectMatchdayBonusEnabled) return 0;
  if (dayPredictions.length === 0) return 0;
  const allCorrect = dayPredictions.every(
    (p) => outcome(p.pred) === outcome(p.result),
  );
  return allCorrect ? cfg.match.perfectMatchdayBonus : 0;
}

/** Maps a team id to its finishing position (1..4). */
export type GroupPositions = Record<number, number>;

/**
 * Score one group's predicted final order against the official table (SCORING §2).
 * Max 15: up to 8 for exact positions, +3 for the correct top-2 set
 * (order-agnostic), +4 for a perfect group.
 */
export function scoreGroup(
  pred: GroupPositions,
  final: GroupPositions,
  cfg: ScoringConfig = SCORING_CONFIG,
): number {
  const g = cfg.group;
  const teams = Object.keys(final).map(Number);

  const exact = teams.filter((t) => pred[t] === final[t]).length;
  let points = exact * g.exactPositionPerTeam;

  const top2 = (m: GroupPositions) =>
    new Set(teams.filter((t) => m[t] != null && m[t] <= 2));
  const predTop2 = top2(pred);
  const finalTop2 = top2(final);
  const sameTop2 =
    predTop2.size === finalTop2.size &&
    [...predTop2].every((t) => finalTop2.has(t));
  if (sameTop2) points += g.correctTop2Set;

  if (exact === teams.length) points += g.perfectGroupBonus;

  return points;
}

/** Stage depth a team reached, ranked 1..6. */
export const BRACKET_RANK = {
  r32: 1,
  r16: 2,
  qf: 3,
  sf: 4,
  final: 5,
  champion: 6,
} as const;

/** Maps a team id to the deepest bracket rank reached (1..6); absent = 0. */
export type BracketRanks = Record<number, number>;

/**
 * Cumulative bracket BASE points (SCORING §3): for every stage threshold a team
 * cleared in BOTH the prediction and reality, award that stage's base. A perfect
 * bracket totals 230 in base points (slot bonuses are scored separately).
 */
export function scoreBracketBase(
  predictedRank: BracketRanks,
  officialRank: BracketRanks,
  cfg: ScoringConfig = SCORING_CONFIG,
): number {
  const baseByRank = [
    cfg.bracket.r32.base,
    cfg.bracket.r16.base,
    cfg.bracket.qf.base,
    cfg.bracket.sf.base,
    cfg.bracket.final.base,
    cfg.bracket.champion.base,
  ];

  const teams = new Set<number>([
    ...Object.keys(predictedRank).map(Number),
    ...Object.keys(officialRank).map(Number),
  ]);

  let total = 0;
  for (const t of teams) {
    const credited = Math.min(predictedRank[t] ?? 0, officialRank[t] ?? 0);
    for (let r = 1; r <= credited; r++) total += baseByRank[r - 1];
  }
  return total;
}

export interface BracketPicks {
  /** Per-group predicted finishers (team ids) that seed the R32. */
  seeds: Record<string, { winner?: number; runnerup?: number; third?: number }>;
  /** Predicted winner team id per FIFA match number. */
  winners: Record<number, number>;
  /** Chosen third-placed entrant team id per R32 match number. */
  thirds: Record<number, number>;
}

const STAGE_RANK: Record<string, number> = {
  r32: 1,
  r16: 2,
  qf: 3,
  sf: 4,
  final: 5,
};

/**
 * Resolve, from a user's bracket picks, the deepest stage rank (1..6) each team
 * is predicted to reach. Mirrors the builder: R32 entrants come from group seeds
 * / chosen thirds, later entrants from predicted winners. Winning the final = 6.
 */
export function predictedBracketRanks(picks: BracketPicks): BracketRanks {
  const ranks: BracketRanks = {};
  const winnerTeam = new Map<number, number | undefined>();

  const side = (m: BracketMatch, which: "a" | "b"): number | undefined => {
    const src = m[which];
    switch (src.type) {
      case "winner":
        return picks.seeds[src.group]?.winner;
      case "runnerup":
        return picks.seeds[src.group]?.runnerup;
      case "third":
        return picks.thirds[m.match];
      case "winnerOf":
        return winnerTeam.get(src.match);
    }
  };

  for (const m of [...BRACKET].sort((x, y) => x.match - y.match)) {
    if (m.stage === "third_place") continue;
    const rank = STAGE_RANK[m.stage];
    const a = side(m, "a");
    const b = side(m, "b");
    for (const t of [a, b]) {
      if (t != null) ranks[t] = Math.max(ranks[t] ?? 0, rank);
    }
    const w = picks.winners[m.match];
    const valid = w === a || w === b ? w : undefined;
    winnerTeam.set(m.match, valid);
    if (m.match === 104 && valid != null) ranks[valid] = 6; // champion
  }

  return ranks;
}

/**
 * Tournament XI ("Golden XI"). Each predicted player who makes the actual XI
 * scores perPlayer; a captain in the XI adds captainBonus; the single highest
 * count threshold met adds its bonus on top.
 */
export function scoreTournamentXi(
  picks: number[],
  captainId: number | null,
  actual: number[] | Set<number>,
  cfg: ScoringConfig = SCORING_CONFIG,
): number {
  const actualSet = actual instanceof Set ? actual : new Set(actual);
  const unique = [...new Set(picks)];
  const correct = unique.filter((p) => actualSet.has(p)).length;

  let pts = correct * cfg.xi.perPlayer;
  if (captainId != null && actualSet.has(captainId)) pts += cfg.xi.captainBonus;

  let best = 0;
  for (const t of cfg.xi.thresholds) {
    if (correct >= t.correct && t.bonus > best) best = t.bonus;
  }
  return pts + best;
}

export interface SpecialsPicks {
  goldenBoot?: number | null;
  bestPlayer?: number | null;
  bestYoung?: number | null;
}

/**
 * Tournament specials (SCORING §4). Each correctly predicted, resolved award
 * earns its configured points. Unresolved awards (null actual) score nothing.
 */
export function scoreSpecials(
  pred: SpecialsPicks,
  actual: SpecialsPicks,
  cfg: ScoringConfig = SCORING_CONFIG,
): number {
  const s = cfg.specials;
  let pts = 0;
  if (actual.goldenBoot != null && pred.goldenBoot === actual.goldenBoot)
    pts += s.goldenBoot;
  if (actual.bestPlayer != null && pred.bestPlayer === actual.bestPlayer)
    pts += s.bestPlayer;
  if (actual.bestYoung != null && pred.bestYoung === actual.bestYoung)
    pts += s.bestYoungPlayer;
  return pts;
}
