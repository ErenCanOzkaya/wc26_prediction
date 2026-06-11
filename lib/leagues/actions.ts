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
