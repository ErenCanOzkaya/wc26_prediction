/**
 * SCORING_CONFIG — the single source of every tunable coefficient (SCORING §6).
 * Business logic must read from here, never hardcode numbers.
 */
export const SCORING_CONFIG = {
  match: {
    exactScore: 5,
    correctResultAndMargin: 3,
    correctDraw: 3,
    correctWinnerOnly: 2,
    perfectMatchdayBonus: 5,
    perfectMatchdayBonusEnabled: true,
  },
  group: {
    exactPositionPerTeam: 2,
    correctTop2Set: 3,
    perfectGroupBonus: 4,
  },
  bracket: {
    r32: { base: 1, slotBonus: 0 },
    r16: { base: 3, slotBonus: 1 },
    qf: { base: 6, slotBonus: 2 },
    sf: { base: 10, slotBonus: 3 },
    final: { base: 16, slotBonus: 4 },
    champion: { base: 30, slotBonus: 5 },
  },
  specials: {
    goldenBoot: 15,
    bestPlayer: 10,
    bestYoungPlayer: 10,
    youngPlayerMaxAge: 21,
    tournamentStartDate: "2026-06-11",
  },
  xi: {
    // Tournament XI ("Golden XI"). Each correctly named player scores perPlayer;
    // captain in the XI adds captainBonus; the single highest count threshold
    // met adds its bonus on top. Perfect XI + captain ≈ 53.
    perPlayer: 3,
    captainBonus: 5,
    thresholds: [
      { correct: 5, bonus: 3 },
      { correct: 8, bonus: 5 },
      { correct: 11, bonus: 15 },
    ],
  },
} as const;

export type ScoringConfig = typeof SCORING_CONFIG;

/**
 * Best Young Player eligibility: age ≤ youngPlayerMaxAge at tournament start
 * (SCORING §4). A player is eligible iff they have not turned (maxAge + 1) by the
 * start date — i.e. dob is strictly after (start − (maxAge + 1) years).
 */
export function isYoungEligible(
  dateOfBirth: string | null,
  cfg: ScoringConfig = SCORING_CONFIG,
): boolean {
  if (!dateOfBirth) return false;
  const start = new Date(cfg.specials.tournamentStartDate);
  const cutoff = new Date(start);
  cutoff.setFullYear(start.getFullYear() - (cfg.specials.youngPlayerMaxAge + 1));
  return new Date(dateOfBirth) > cutoff;
}
