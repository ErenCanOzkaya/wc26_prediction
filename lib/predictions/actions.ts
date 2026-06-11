"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isMatchLocked,
  isGroupLocked,
  isSpecialsLocked,
  isBracketLocked,
} from "@/lib/locks";
import { isYoungEligible } from "@/lib/scoring/config";

export interface ActionResult {
  ok?: true;
  error?: string;
}

/**
 * Save a score prediction for one match. Server-enforces the kickoff lock
 * (DESIGN §6) in addition to the DB RLS owner check.
 */
export async function saveMatchPrediction(
  matchId: number,
  homeScore: number,
  awayScore: number,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (
    !Number.isInteger(homeScore) ||
    !Number.isInteger(awayScore) ||
    homeScore < 0 ||
    awayScore < 0 ||
    homeScore > 99 ||
    awayScore > 99
  ) {
    return { error: "Invalid score" };
  }

  const { data: match } = await supabase
    .from("matches")
    .select("kickoff, home_team_id, away_team_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return { error: "Match not found" };
  if (match.home_team_id == null || match.away_team_id == null) {
    return { error: "Teams not decided yet" };
  }
  if (isMatchLocked(match.kickoff)) return { error: "This match is locked" };

  const { error } = await supabase.from("match_predictions").upsert(
    {
      user_id: user.id,
      match_id: matchId,
      home_score: homeScore,
      away_score: awayScore,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/predictions/matches");
  return { ok: true };
}

/**
 * Save the predicted final order (positions 1..4) for one group. Server-enforces
 * the per-group lock (first kickoff of that group).
 */
export async function saveGroupOrder(
  groupLabel: string,
  orderedTeamIds: number[],
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (orderedTeamIds.length !== 4) {
    return { error: "A group needs exactly 4 teams" };
  }

  // Lock: earliest group-stage kickoff for this group.
  const { data: firstMatch } = await supabase
    .from("matches")
    .select("kickoff")
    .eq("stage", "group")
    .eq("group_label", groupLabel)
    .order("kickoff", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (isGroupLocked(firstMatch?.kickoff ?? null)) {
    return { error: "This group is locked" };
  }

  // Validate the submitted teams actually belong to this group.
  const { data: groupTeams } = await supabase
    .from("teams")
    .select("id")
    .eq("group_label", groupLabel);
  const valid = new Set((groupTeams ?? []).map((t) => t.id as number));
  if (
    valid.size !== 4 ||
    orderedTeamIds.length !== new Set(orderedTeamIds).size ||
    orderedTeamIds.some((id) => !valid.has(id))
  ) {
    return { error: "Invalid team set for this group" };
  }

  const rows = orderedTeamIds.map((teamId, i) => ({
    user_id: user.id,
    group_label: groupLabel,
    team_id: teamId,
    position: i + 1,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("group_predictions")
    .upsert(rows, { onConflict: "user_id,group_label,team_id" });
  if (error) return { error: error.message };

  revalidatePath("/predictions/groups");
  return { ok: true };
}

/**
 * Save the tournament specials (Golden Boot + optional Best/Young Player).
 * Locks at the tournament opening kickoff (earliest match overall).
 */
export async function saveSpecials(input: {
  goldenBootId: number | null;
  bestPlayerId: number | null;
  bestYoungId: number | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: opening } = await supabase
    .from("matches")
    .select("kickoff")
    .order("kickoff", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (isSpecialsLocked(opening?.kickoff ?? null)) {
    return { error: "Specials are locked" };
  }

  const ids = [input.goldenBootId, input.bestPlayerId, input.bestYoungId].filter(
    (v): v is number => v != null,
  );
  if (ids.length) {
    const { data: players } = await supabase
      .from("players")
      .select("id,date_of_birth")
      .in("id", ids);
    const found = new Map((players ?? []).map((p) => [p.id, p.date_of_birth]));
    if (ids.some((id) => !found.has(id))) {
      return { error: "Unknown player selected" };
    }
    if (
      input.bestYoungId != null &&
      !isYoungEligible(found.get(input.bestYoungId) ?? null)
    ) {
      return { error: "Best Young Player must be 21 or under at the start" };
    }
  }

  const { error } = await supabase.from("special_predictions").upsert(
    {
      user_id: user.id,
      golden_boot_id: input.goldenBootId,
      best_player_id: input.bestPlayerId,
      best_young_id: input.bestYoungId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/predictions/specials");
  return { ok: true };
}

/**
 * Save the Tournament XI: a formation, up to 11 players (by slot) and a captain.
 * Locks with the specials (tournament opening kickoff).
 */
export async function saveTournamentXi(input: {
  formation: string;
  captainId: number | null;
  picks: { slot: number; playerId: number }[];
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: opening } = await supabase
    .from("matches")
    .select("kickoff")
    .order("kickoff", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (isSpecialsLocked(opening?.kickoff ?? null)) {
    return { error: "Tournament XI is locked" };
  }

  const ids = input.picks.map((p) => p.playerId);
  if (input.captainId != null) ids.push(input.captainId);
  if (ids.length) {
    const { data: players } = await supabase
      .from("players")
      .select("id")
      .in("id", ids);
    const known = new Set((players ?? []).map((p) => p.id));
    if (ids.some((id) => !known.has(id))) {
      return { error: "Unknown player selected" };
    }
  }
  if (input.captainId != null && !ids.includes(input.captainId)) {
    // captain must be one of the XI
    return { error: "Captain must be in your XI" };
  }

  const { error: e1 } = await supabase.from("tournament_xi").upsert(
    {
      user_id: user.id,
      formation: input.formation,
      captain_id: input.captainId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (e1) return { error: e1.message };

  const del = await supabase.from("xi_picks").delete().eq("user_id", user.id);
  if (del.error) return { error: del.error.message };
  if (input.picks.length) {
    const rows = input.picks.map((p) => ({
      user_id: user.id,
      slot: p.slot,
      player_id: p.playerId,
    }));
    const { error: e2 } = await supabase.from("xi_picks").insert(rows);
    if (e2) return { error: e2.message };
  }

  revalidatePath("/predictions/specials");
  return { ok: true };
}

/**
 * Save the knockout bracket. `winners[match] = teamId` is the predicted advancer
 * of each knockout match; `thirds[match] = teamId` is the chosen third-placed
 * entrant of an R32 match. Stored as a full replace of the user's bracket.
 * Locks at the first Round-of-32 kickoff (DESIGN §6, one edit window before).
 */
export async function saveBracket(input: {
  winners: { match: number; teamId: number }[];
  thirds: { match: number; teamId: number }[];
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: firstR32 } = await supabase
    .from("matches")
    .select("kickoff")
    .eq("stage", "r32")
    .order("kickoff", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (isBracketLocked(firstR32?.kickoff ?? null)) {
    return { error: "The bracket is locked" };
  }

  const allTeamIds = [
    ...input.winners.map((w) => w.teamId),
    ...input.thirds.map((t) => t.teamId),
  ];
  if (allTeamIds.length) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id")
      .in("id", allTeamIds);
    const known = new Set((teams ?? []).map((t) => t.id as number));
    if (allTeamIds.some((id) => !known.has(id))) {
      return { error: "Unknown team in bracket" };
    }
  }

  const rows = [
    ...input.thirds.map((t) => ({
      user_id: user.id,
      slot_id: `E${t.match}`,
      team_id: t.teamId,
      version: 1,
      updated_at: new Date().toISOString(),
    })),
    ...input.winners.map((w) => ({
      user_id: user.id,
      slot_id: `W${w.match}`,
      team_id: w.teamId,
      version: 1,
      updated_at: new Date().toISOString(),
    })),
  ];

  // Full replace: clear the previous bracket, then insert the current one.
  const del = await supabase
    .from("bracket_predictions")
    .delete()
    .eq("user_id", user.id);
  if (del.error) return { error: del.error.message };

  if (rows.length) {
    const { error } = await supabase.from("bracket_predictions").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/predictions/bracket");
  return { ok: true };
}
