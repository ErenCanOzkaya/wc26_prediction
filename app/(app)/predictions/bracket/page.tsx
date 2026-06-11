import { createClient } from "@/lib/supabase/server";
import { isBracketLocked } from "@/lib/locks";
import { BracketBuilder } from "@/components/BracketBuilder";
import type { TeamLite } from "@/components/MatchPredictionRow";

export const dynamic = "force-dynamic";

export interface GroupResolved {
  winner: TeamLite;
  runnerup: TeamLite;
  third: TeamLite;
}

export default async function BracketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: teams }, { data: standings }, { data: gpreds }, { data: bpreds }, { data: firstR32 }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id,name,short_name,crest_url,group_label")
        .not("group_label", "is", null),
      supabase.from("group_standings").select("group_label,team_id,position"),
      supabase
        .from("group_predictions")
        .select("group_label,team_id,position")
        .eq("user_id", user!.id),
      supabase
        .from("bracket_predictions")
        .select("slot_id,team_id")
        .eq("user_id", user!.id),
      supabase
        .from("matches")
        .select("kickoff")
        .eq("stage", "r32")
        .order("kickoff", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

  const teamsById = new Map<number, TeamLite>();
  const byGroup = new Map<string, TeamLite[]>();
  for (const t of teams ?? []) {
    const lite: TeamLite = {
      id: t.id,
      name: t.name,
      short_name: t.short_name,
      crest_url: t.crest_url,
    };
    teamsById.set(t.id, lite);
    const g = t.group_label as string;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(lite);
  }

  // Predicted (or standings-fallback) finishing position per team.
  const predPos = new Map<string, number>();
  for (const p of gpreds ?? [])
    predPos.set(`${p.group_label}:${p.team_id}`, p.position);
  const standPos = new Map<string, number>();
  for (const s of standings ?? [])
    standPos.set(`${s.group_label}:${s.team_id}`, s.position);

  const groups: Record<string, GroupResolved> = {};
  for (const [label, list] of byGroup) {
    const hasPred = (gpreds ?? []).some((p) => p.group_label === label);
    const posOf = (id: number) =>
      hasPred
        ? (predPos.get(`${label}:${id}`) ?? 99)
        : (standPos.get(`${label}:${id}`) ?? 99);
    const ordered = [...list].sort(
      (a, b) => posOf(a.id) - posOf(b.id) || a.name.localeCompare(b.name),
    );
    groups[label] = {
      winner: ordered[0],
      runnerup: ordered[1],
      third: ordered[2],
    };
  }

  // Existing picks.
  const initialWinners: Record<number, number> = {};
  const initialThirds: Record<number, number> = {};
  for (const b of bpreds ?? []) {
    const id = b.slot_id as string;
    const n = parseInt(id.slice(1), 10);
    if (id.startsWith("W")) initialWinners[n] = b.team_id;
    else if (id.startsWith("E")) initialThirds[n] = b.team_id;
  }

  const locked = isBracketLocked(firstR32?.kickoff ?? null);
  const teamArray = [...teamsById.values()];

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Your Round-of-32 seeds come from your group predictions (winners &
        runners-up). Pick the 8 third-placed entrants, then click a team to
        advance it through each round. Locks at the first R32 kickoff.
      </p>
      <BracketBuilder
        groups={groups}
        teams={teamArray}
        locked={locked}
        initialWinners={initialWinners}
        initialThirds={initialThirds}
      />
    </div>
  );
}
