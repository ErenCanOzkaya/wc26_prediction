export interface PlayerFacts {
  nationality: string;
  league: string | null;
  currentClub: string | null;
  birthYear: number;
  position: string; // role: GK | DEF | MID | ATT
}

export interface Chip {
  value: string | number | null;
  match: boolean;
  direction?: "up" | "down" | null;
}

export interface Comparison {
  nationality: Chip;
  league: Chip;
  currentClub: Chip;
  age: Chip;
  position: Chip;
}

const eq = (a: unknown, b: unknown) => a != null && a === b;

/** Compare a guessed player against the answer for the per-guess chips. */
export function comparePlayers(
  guess: PlayerFacts,
  answer: PlayerFacts,
): Comparison {
  return {
    nationality: {
      value: guess.nationality,
      match: eq(guess.nationality, answer.nationality),
    },
    league: { value: guess.league, match: eq(guess.league, answer.league) },
    currentClub: {
      value: guess.currentClub,
      match: eq(guess.currentClub, answer.currentClub),
    },
    position: { value: guess.position, match: eq(guess.position, answer.position) },
    age: {
      value: guess.birthYear,
      match: guess.birthYear === answer.birthYear,
      direction:
        guess.birthYear === answer.birthYear
          ? null
          : answer.birthYear < guess.birthYear
            ? "up" // answer is older
            : "down",
    },
  };
}
