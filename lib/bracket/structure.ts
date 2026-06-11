/**
 * Official 2026 FIFA World Cup knockout bracket structure (verified against the
 * published schedule). Match numbers are FIFA's (73–104). The two entrants of
 * each Round-of-32 match are defined by group finishing positions; later rounds
 * are fed by the winners of two earlier matches.
 *
 * This drives the bracket BUILDER (predictions). Linking these positions to the
 * provider's knockout match ids for official resolution/scoring happens in the
 * scoring phase once the knockout teams resolve.
 */

export type BracketStage = "r32" | "r16" | "qf" | "sf" | "final" | "third_place";

/** How a Round-of-32 entrant slot is seeded from the group stage. */
export type R32Source =
  | { type: "winner"; group: string } // Winner of Group X
  | { type: "runnerup"; group: string } // Runner-up of Group X
  | { type: "third"; groups: string[] }; // One of the 8 best third-placed teams

/** A later-round entrant comes from the winner of an earlier match. */
export type FeederSource = { type: "winnerOf"; match: number };

export interface BracketMatch {
  match: number; // FIFA match number
  stage: BracketStage;
  a: R32Source | FeederSource;
  b: R32Source | FeederSource;
}

export const BRACKET: BracketMatch[] = [
  // ---- Round of 32 (73–88) ----
  { match: 73, stage: "r32", a: { type: "runnerup", group: "A" }, b: { type: "runnerup", group: "B" } },
  { match: 74, stage: "r32", a: { type: "winner", group: "E" }, b: { type: "third", groups: ["A", "B", "C", "D", "F"] } },
  { match: 75, stage: "r32", a: { type: "winner", group: "F" }, b: { type: "runnerup", group: "C" } },
  { match: 76, stage: "r32", a: { type: "winner", group: "C" }, b: { type: "runnerup", group: "F" } },
  { match: 77, stage: "r32", a: { type: "winner", group: "I" }, b: { type: "third", groups: ["C", "D", "F", "G", "H"] } },
  { match: 78, stage: "r32", a: { type: "runnerup", group: "E" }, b: { type: "runnerup", group: "I" } },
  { match: 79, stage: "r32", a: { type: "winner", group: "A" }, b: { type: "third", groups: ["C", "E", "F", "H", "I"] } },
  { match: 80, stage: "r32", a: { type: "winner", group: "L" }, b: { type: "third", groups: ["E", "H", "I", "J", "K"] } },
  { match: 81, stage: "r32", a: { type: "winner", group: "D" }, b: { type: "third", groups: ["B", "E", "F", "I", "J"] } },
  { match: 82, stage: "r32", a: { type: "winner", group: "G" }, b: { type: "third", groups: ["A", "E", "H", "I", "J"] } },
  { match: 83, stage: "r32", a: { type: "runnerup", group: "K" }, b: { type: "runnerup", group: "L" } },
  { match: 84, stage: "r32", a: { type: "winner", group: "H" }, b: { type: "runnerup", group: "J" } },
  { match: 85, stage: "r32", a: { type: "winner", group: "B" }, b: { type: "third", groups: ["E", "F", "G", "I", "J"] } },
  { match: 86, stage: "r32", a: { type: "winner", group: "J" }, b: { type: "runnerup", group: "H" } },
  { match: 87, stage: "r32", a: { type: "winner", group: "K" }, b: { type: "third", groups: ["D", "E", "I", "J", "L"] } },
  { match: 88, stage: "r32", a: { type: "runnerup", group: "D" }, b: { type: "runnerup", group: "G" } },

  // ---- Round of 16 (89–96) ----
  { match: 89, stage: "r16", a: { type: "winnerOf", match: 74 }, b: { type: "winnerOf", match: 77 } },
  { match: 90, stage: "r16", a: { type: "winnerOf", match: 73 }, b: { type: "winnerOf", match: 75 } },
  { match: 91, stage: "r16", a: { type: "winnerOf", match: 76 }, b: { type: "winnerOf", match: 78 } },
  { match: 92, stage: "r16", a: { type: "winnerOf", match: 79 }, b: { type: "winnerOf", match: 80 } },
  { match: 93, stage: "r16", a: { type: "winnerOf", match: 83 }, b: { type: "winnerOf", match: 84 } },
  { match: 94, stage: "r16", a: { type: "winnerOf", match: 81 }, b: { type: "winnerOf", match: 82 } },
  { match: 95, stage: "r16", a: { type: "winnerOf", match: 86 }, b: { type: "winnerOf", match: 88 } },
  { match: 96, stage: "r16", a: { type: "winnerOf", match: 85 }, b: { type: "winnerOf", match: 87 } },

  // ---- Quarter-finals (97–100) ----
  { match: 97, stage: "qf", a: { type: "winnerOf", match: 89 }, b: { type: "winnerOf", match: 90 } },
  { match: 98, stage: "qf", a: { type: "winnerOf", match: 93 }, b: { type: "winnerOf", match: 94 } },
  { match: 99, stage: "qf", a: { type: "winnerOf", match: 91 }, b: { type: "winnerOf", match: 92 } },
  { match: 100, stage: "qf", a: { type: "winnerOf", match: 95 }, b: { type: "winnerOf", match: 96 } },

  // ---- Semi-finals (101–102) ----
  { match: 101, stage: "sf", a: { type: "winnerOf", match: 97 }, b: { type: "winnerOf", match: 98 } },
  { match: 102, stage: "sf", a: { type: "winnerOf", match: 99 }, b: { type: "winnerOf", match: 100 } },

  // ---- Third place (103) & Final (104) ----
  { match: 103, stage: "third_place", a: { type: "winnerOf", match: 101 }, b: { type: "winnerOf", match: 102 } },
  { match: 104, stage: "final", a: { type: "winnerOf", match: 101 }, b: { type: "winnerOf", match: 102 } },
];

export const STAGE_ORDER: Exclude<BracketStage, "third_place">[] = [
  "r32",
  "r16",
  "qf",
  "sf",
  "final",
];

export const STAGE_TITLE: Record<BracketStage, string> = {
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-finals",
  sf: "Semi-finals",
  final: "Final",
  third_place: "Third place",
};

export const byStage = (stage: BracketStage) =>
  BRACKET.filter((m) => m.stage === stage);

export const matchByNumber = (n: number) =>
  BRACKET.find((m) => m.match === n);

/**
 * Display order per round for a left-to-right bracket tree: a post-order DFS
 * from the Final puts each match's two feeders adjacent, so connectors line up.
 */
export const BRACKET_COLUMNS: Record<
  Exclude<BracketStage, "third_place">,
  number[]
> = (() => {
  const order: Record<string, number[]> = {
    r32: [],
    r16: [],
    qf: [],
    sf: [],
    final: [],
  };
  const visit = (n: number) => {
    const m = matchByNumber(n);
    if (!m) return;
    if (m.a.type === "winnerOf") visit(m.a.match);
    if (m.b.type === "winnerOf") visit(m.b.match);
    if (m.stage !== "third_place") order[m.stage].push(n);
  };
  visit(104);
  return order as Record<Exclude<BracketStage, "third_place">, number[]>;
})();
