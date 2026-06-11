import { describe, test, expect } from "vitest";
import {
  scoreMatch,
  scoreGroup,
  scoreBracketBase,
  perfectMatchdayBonus,
  scoreSpecials,
  predictedBracketRanks,
  scoreTournamentXi,
} from "./engine";
import { SCORING_CONFIG } from "./config";

describe("scoreMatch (SCORING §1)", () => {
  test("exact score → 5", () => {
    expect(scoreMatch({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(5);
  });

  test("correct result + correct margin, wrong score → 3", () => {
    expect(scoreMatch({ home: 2, away: 0 }, { home: 3, away: 1 })).toBe(3);
  });

  test("correct draw, wrong score → 3", () => {
    expect(scoreMatch({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(3);
  });

  test("correct winner only, wrong margin → 2", () => {
    expect(scoreMatch({ home: 1, away: 0 }, { home: 3, away: 1 })).toBe(2);
  });

  test("wrong result → 0", () => {
    expect(scoreMatch({ home: 2, away: 0 }, { home: 0, away: 1 })).toBe(0);
  });

  test("predicted draw but result decisive → 0", () => {
    expect(scoreMatch({ home: 1, away: 1 }, { home: 2, away: 0 })).toBe(0);
  });

  test("takes the single highest tier (exact also satisfies margin)", () => {
    expect(scoreMatch({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(5);
  });
});

// Final table: teamId -> finishing position (1..4).
const FINAL = { 1: 1, 2: 2, 3: 3, 4: 4 };

describe("scoreGroup (SCORING §2)", () => {
  test("perfect group → 15 (8 exact + 3 top-2 + 4 bonus)", () => {
    expect(scoreGroup({ 1: 1, 2: 2, 3: 3, 4: 4 }, FINAL)).toBe(15);
  });

  test("top-2 set correct but order swapped, rest swapped → 3", () => {
    expect(scoreGroup({ 1: 2, 2: 1, 3: 4, 4: 3 }, FINAL)).toBe(3);
  });

  test("two teams in exact position, top-2 set wrong → 4", () => {
    // teams 1 and 4 exact (+4); predicted top-2 {1,3} ≠ final {1,2}
    expect(scoreGroup({ 1: 1, 2: 3, 3: 2, 4: 4 }, FINAL)).toBe(4);
  });

  test("fully reversed → 0", () => {
    expect(scoreGroup({ 1: 4, 2: 3, 3: 2, 4: 1 }, FINAL)).toBe(0);
  });

  test("top 2 exact, bottom 2 swapped → 4 exact + 3 top-2 = 7 (not perfect)", () => {
    expect(scoreGroup({ 1: 1, 2: 2, 3: 4, 4: 3 }, FINAL)).toBe(2 * 2 + 3);
  });
});

// Bracket rank: 1=R32, 2=R16, 3=QF, 4=SF, 5=Final, 6=Champion.
describe("scoreBracketBase (SCORING §3, cumulative)", () => {
  test("champion predicted & achieved → 1+3+6+10+16+30 = 66", () => {
    expect(scoreBracketBase({ 1: 6 }, { 1: 6 })).toBe(66);
  });

  test("credited to the shallower of predicted vs official", () => {
    // predicted Final (5), only reached QF (3) → 1+3+6 = 10
    expect(scoreBracketBase({ 1: 5 }, { 1: 3 })).toBe(10);
    // predicted R16 (2), became champion (6) → 1+3 = 4
    expect(scoreBracketBase({ 1: 2 }, { 1: 6 })).toBe(4);
  });

  test("team not predicted to advance scores 0", () => {
    expect(scoreBracketBase({}, { 1: 4 })).toBe(0);
  });

  test("a perfect bracket totals 230 in base points", () => {
    const map: Record<number, number> = {};
    map[1] = 6; // champion
    map[2] = 5; // runner-up
    for (let t = 3; t <= 4; t++) map[t] = 4; // 2 semi-finalists
    for (let t = 5; t <= 8; t++) map[t] = 3; // 4 quarter-finalists
    for (let t = 9; t <= 16; t++) map[t] = 2; // 8 round-of-16
    for (let t = 17; t <= 32; t++) map[t] = 1; // 16 round-of-32
    expect(scoreBracketBase(map, map)).toBe(230);
  });
});

describe("perfectMatchdayBonus (SCORING §1)", () => {
  test("all outcomes correct → +5", () => {
    expect(
      perfectMatchdayBonus([
        { pred: { home: 2, away: 0 }, result: { home: 1, away: 0 } }, // home win ✓
        { pred: { home: 1, away: 1 }, result: { home: 3, away: 3 } }, // draw ✓
      ]),
    ).toBe(5);
  });

  test("one outcome wrong → 0", () => {
    expect(
      perfectMatchdayBonus([
        { pred: { home: 2, away: 0 }, result: { home: 1, away: 0 } },
        { pred: { home: 1, away: 0 }, result: { home: 0, away: 2 } }, // wrong
      ]),
    ).toBe(0);
  });

  test("no predictions that day → 0", () => {
    expect(perfectMatchdayBonus([])).toBe(0);
  });

  test("disabled in config → 0", () => {
    const cfg = {
      ...SCORING_CONFIG,
      match: { ...SCORING_CONFIG.match, perfectMatchdayBonusEnabled: false },
    };
    expect(
      perfectMatchdayBonus(
        [{ pred: { home: 1, away: 0 }, result: { home: 2, away: 0 } }],
        cfg,
      ),
    ).toBe(0);
  });
});

describe("scoreSpecials (SCORING §4)", () => {
  test("Golden Boot correct → +15", () => {
    expect(
      scoreSpecials({ goldenBoot: 10 }, { goldenBoot: 10 }),
    ).toBe(15);
  });

  test("all three correct → 15 + 10 + 10 = 35", () => {
    expect(
      scoreSpecials(
        { goldenBoot: 1, bestPlayer: 2, bestYoung: 3 },
        { goldenBoot: 1, bestPlayer: 2, bestYoung: 3 },
      ),
    ).toBe(35);
  });

  test("wrong picks score 0", () => {
    expect(
      scoreSpecials({ goldenBoot: 1, bestPlayer: 2 }, { goldenBoot: 9, bestPlayer: 8 }),
    ).toBe(0);
  });

  test("unresolved actuals (null) score 0 even if predicted", () => {
    expect(
      scoreSpecials(
        { goldenBoot: 1, bestPlayer: 2, bestYoung: 3 },
        { goldenBoot: null, bestPlayer: null, bestYoung: null },
      ),
    ).toBe(0);
  });
});

describe("predictedBracketRanks", () => {
  test("a team advanced all the way → rank 6 (champion)", () => {
    // Group A winner's path: win matches 79→92→99→102→104.
    const ranks = predictedBracketRanks({
      seeds: { A: { winner: 100 } },
      winners: { 79: 100, 92: 100, 99: 100, 102: 100, 104: 100 },
      thirds: {},
    });
    expect(ranks[100]).toBe(6);
  });

  test("a seeded team never advanced → rank 1 (reached R32 only)", () => {
    const ranks = predictedBracketRanks({
      seeds: { B: { runnerup: 200 } }, // entrant of match 73
      winners: {},
      thirds: {},
    });
    expect(ranks[200]).toBe(1);
  });
});

describe("scoreTournamentXi", () => {
  const A = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // actual golden XI
  test("no correct players → 0", () => {
    expect(scoreTournamentXi([90, 91, 92], null, A)).toBe(0);
  });
  test("3 correct, no captain → 9", () => {
    expect(scoreTournamentXi([1, 2, 3, 99], null, A)).toBe(9);
  });
  test("5 correct → 15 + threshold 3 = 18", () => {
    expect(scoreTournamentXi([1, 2, 3, 4, 5, 99], null, A)).toBe(18);
  });
  test("8 correct → 24 + 5 = 29", () => {
    expect(scoreTournamentXi([1, 2, 3, 4, 5, 6, 7, 8], null, A)).toBe(29);
  });
  test("perfect XI + captain in XI → 33 + 5 + 15 = 53", () => {
    expect(scoreTournamentXi(A, 7, A)).toBe(53);
  });
  test("captain not in XI → no captain bonus", () => {
    expect(scoreTournamentXi([1, 2, 3], 99, A)).toBe(9);
  });
});
