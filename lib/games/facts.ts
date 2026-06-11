import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerFacts } from "./compare";

const ROLE: Record<string, string> = {
  Goalkeeper: "GK",
  Defence: "DEF",
  Midfield: "MID",
  Offence: "ATT",
};

/**
 * Load the comparison facts for a set of player ids. Nationality is the national
 * team name; current club + league come from the player's last career spell.
 */
export async function loadPlayerFacts(
  db: SupabaseClient,
  ids: number[],
): Promise<Map<number, PlayerFacts>> {
  if (ids.length === 0) return new Map();
  const [{ data: players }, { data: career }] = await Promise.all([
    db
      .from("players")
      .select("id,position,date_of_birth,teams(name)")
      .in("id", ids),
    db
      .from("player_career")
      .select("player_id,ord,club,league")
      .in("player_id", ids)
      .order("ord", { ascending: true }),
  ]);

  // Last spell per player.
  const last = new Map<number, { club: string; league: string | null }>();
  for (const r of career ?? []) {
    last.set(r.player_id as number, {
      club: r.club as string,
      league: (r.league as string | null) ?? null,
    });
  }

  const out = new Map<number, PlayerFacts>();
  for (const p of players ?? []) {
    const team = Array.isArray(p.teams) ? p.teams[0] : p.teams;
    const spell = last.get(p.id as number);
    out.set(p.id as number, {
      nationality: (team?.name as string) ?? "—",
      league: spell?.league ?? null,
      currentClub: spell?.club ?? null,
      birthYear: p.date_of_birth
        ? Number((p.date_of_birth as string).slice(0, 4))
        : 0,
      position: ROLE[(p.position as string) ?? ""] ?? "ATT",
    });
  }
  return out;
}
