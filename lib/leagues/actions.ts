"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface LeagueResult {
  league?: { id: string; name: string; invite_code: string };
  error?: string;
}

export async function createLeague(name: string): Promise<LeagueResult> {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) return { error: "League name is required" };
  if (trimmed.length > 60) return { error: "League name is too long" };

  const { data, error } = await supabase.rpc("create_league", {
    p_name: trimmed,
  });
  if (error) return { error: error.message };

  revalidatePath("/leagues");
  return { league: data };
}

/** Owner-only: delete a league (RLS enforces ownership; members cascade). */
export async function deleteLeague(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("leagues").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/leagues");
  return { ok: true };
}

/** Leave a league. The owner must delete it instead. */
export async function leaveLeague(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: league } = await supabase
    .from("leagues")
    .select("owner_id")
    .eq("id", id)
    .maybeSingle();
  if (league?.owner_id === user.id) {
    return { error: "As the owner, delete the league instead of leaving." };
  }

  const { error } = await supabase
    .from("league_members")
    .delete()
    .eq("league_id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/leagues");
  return { ok: true };
}

export async function joinLeague(code: string): Promise<LeagueResult> {
  const supabase = await createClient();
  const trimmed = code.trim();
  if (!trimmed) return { error: "Invite code is required" };

  const { data, error } = await supabase.rpc("join_league_by_code", {
    p_code: trimmed,
  });
  if (error) return { error: error.message };

  revalidatePath("/leagues");
  return { league: data };
}
