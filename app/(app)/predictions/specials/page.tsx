import { createClient } from "@/lib/supabase/server";
import { isSpecialsLocked } from "@/lib/locks";
import { isYoungEligible } from "@/lib/scoring/config";
import { SpecialsForm } from "@/components/SpecialsForm";
import { TournamentXI } from "@/components/TournamentXI";
import type { PlayerLite } from "@/components/PlayerCombobox";

export const dynamic = "force-dynamic";

export default async function SpecialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // PostgREST caps a response at 1000 rows; there are ~1249 players, so paginate.
  const players: {
    id: number;
    name: string;
    position: string | null;
    date_of_birth: string | null;
    team_id: number;
  }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("players")
      .select("id,name,position,date_of_birth,team_id")
      .order("name", { ascending: true })
      .range(from, from + 999);
    if (!data?.length) break;
    players.push(...(data as typeof players));
    if (data.length < 1000) break;
  }

  const [{ data: teams }, { data: mine }, { data: opening }, { data: xi }, { data: xiPicks }] =
    await Promise.all([
      supabase.from("teams").select("id,name"),
    supabase
      .from("special_predictions")
      .select("golden_boot_id,best_player_id,best_young_id")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("matches")
      .select("kickoff")
      .order("kickoff", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("tournament_xi")
      .select("formation,captain_id")
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase.from("xi_picks").select("slot,player_id").eq("user_id", user!.id),
  ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name as string]));
  const playerList: PlayerLite[] = (players ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    teamName: teamName.get(p.team_id) ?? "—",
    position: p.position,
    eligibleYoung: isYoungEligible(p.date_of_birth),
  }));

  const locked = isSpecialsLocked(opening?.kickoff ?? null);
  const xiPickMap: Record<number, number> = {};
  for (const p of xiPicks ?? []) xiPickMap[p.slot] = p.player_id;

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-4 text-sm text-muted">
          Locks at the tournament opening kickoff. Best / Best Young Player are
          resolved by the league admin at the end.
        </p>
        <SpecialsForm
          players={playerList}
          locked={locked}
          initial={{
            goldenBootId: mine?.golden_boot_id ?? null,
            bestPlayerId: mine?.best_player_id ?? null,
            bestYoungId: mine?.best_young_id ?? null,
          }}
        />
      </div>

      <div>
        <h2 className="display text-2xl">Tournament XI</h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Pick the 11 stars you think make the tournament’s Golden XI and name a
          captain. Each correct player +3, captain in the XI +5, with milestone
          bonuses up to a perfect XI.
        </p>
        <TournamentXI
          players={playerList}
          locked={locked}
          initial={{
            formation: xi?.formation ?? "4-3-3",
            captainId: xi?.captain_id ?? null,
            picks: xiPickMap,
          }}
        />
      </div>
    </div>
  );
}
