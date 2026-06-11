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
