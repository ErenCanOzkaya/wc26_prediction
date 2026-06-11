import "server-only";

/**
 * Prediction locking (DESIGN §6). Pure predicates so the same rule drives the UI
 * (read-only state) and the server actions (write rejection). The DB RLS read
 * gates use the equivalent conditions.
 */

/** Match score locks at that match's kickoff. */
export function isMatchLocked(
  kickoff: string | Date,
  now: Date = new Date(),
): boolean {
  return new Date(kickoff) <= now;
}

/** Group standings lock at the first kickoff of THAT group (staggered). */
export function isGroupLocked(
  firstGroupKickoff: string | Date | null,
  now: Date = new Date(),
): boolean {
  return firstGroupKickoff != null && new Date(firstGroupKickoff) <= now;
}

/** Bracket locks at the first Round-of-32 kickoff (one edit window before that). */
export function isBracketLocked(
  firstR32Kickoff: string | Date | null,
  now: Date = new Date(),
): boolean {
  return firstR32Kickoff != null && new Date(firstR32Kickoff) <= now;
}

/** Specials lock at the tournament opening kickoff (earliest match overall). */
export function isSpecialsLocked(
  openingKickoff: string | Date | null,
  now: Date = new Date(),
): boolean {
  return openingKickoff != null && new Date(openingKickoff) <= now;
}
