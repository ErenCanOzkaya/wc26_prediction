"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleWatch(
  matchId: number,
  watching: boolean,
): Promise<{ ok?: true; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (watching) {
    const { error } = await supabase
      .from("watchlist")
      .upsert({ user_id: user.id, match_id: matchId }, { onConflict: "user_id,match_id" });
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from("watchlist")
      .delete()
      .eq("user_id", user.id)
      .eq("match_id", matchId);
    if (error) return { error: error.message };
  }

  revalidatePath("/calendar");
  return { ok: true };
}
