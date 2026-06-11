/** Points for a finished career-path game. clubCount = guess limit (G). */
export function scoreGame(
  clubCount: number,
  movesUsed: number,
  solved: boolean,
): number {
  if (!solved) return 0;
  return Math.max(1, clubCount - movesUsed + 1);
}
