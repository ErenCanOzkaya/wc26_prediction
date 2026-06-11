/** Stable integer seed from an ISO date string (YYYY-MM-DD). */
export function dateSeed(isoDate: string): number {
  let h = 0;
  for (let i = 0; i < isoDate.length; i++) {
    h = (h * 31 + isoDate.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Deterministically pick one eligible player id for a daily puzzle, avoiding
 * recently used ids. `eligible` should be passed in a stable (sorted) order.
 */
export function pickDailyPlayer(
  seed: number,
  eligible: number[],
  recent: number[],
): number {
  const recentSet = new Set(recent);
  const pool = eligible.filter((id) => !recentSet.has(id));
  const choices = pool.length > 0 ? pool : eligible;
  if (choices.length === 0) throw new Error("no eligible players");
  return choices[Math.abs(seed) % choices.length];
}
