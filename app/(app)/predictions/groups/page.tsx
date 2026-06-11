import { createClient } from "@/lib/supabase/server";
import { isGroupLocked } from "@/lib/locks";
import { GroupSortable } from "@/components/GroupSortable";
import type { TeamLite } from "@/components/MatchPredictionRow";

export const dynamic = "force-dynamic";

const ACCENTS = [
  "var(--color-green)",
  "var(--color-navy)",
  "var(--color-red)",
  "var(--color-sand)",
];

export default async function GroupPredictionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: teams }, { data: standings }, { data: preds }, { data: groupMatches }] =
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
        .from("matches")
        .select("group_label,kickoff")
        .eq("stage", "group")
        .order("kickoff", { ascending: true }),
    ]);

  // First (earliest) kickoff per group -> lock state.
  const firstKickoff = new Map<string, string>();
  for (const m of groupMatches ?? []) {
    if (m.group_label && !firstKickoff.has(m.group_label)) {
      firstKickoff.set(m.group_label, m.kickoff);
    }
  }

  // Default ordering hint from provisional standings position.
  const standingPos = new Map<string, number>(); // `${label}:${teamId}` -> pos
  for (const s of standings ?? []) {
    standingPos.set(`${s.group_label}:${s.team_id}`, s.position);
  }
  // User's saved predicted position.
  const predPos = new Map<string, number>();
  for (const p of preds ?? []) {
    predPos.set(`${p.group_label}:${p.team_id}`, p.position);
  }

  const byGroup = new Map<string, TeamLite[]>();
  for (const t of teams ?? []) {
    const label = t.group_label as string;
    if (!byGroup.has(label)) byGroup.set(label, []);
    byGroup.get(label)!.push({
      id: t.id,
      name: t.name,
      short_name: t.short_name,
      crest_url: t.crest_url,
    });
  }

  const labels = [...byGroup.keys()].sort();

  function order(label: string, list: TeamLite[]): TeamLite[] {
    const hasPred = (preds ?? []).some((p) => p.group_label === label);
    const posOf = (id: number) =>
      hasPred
        ? (predPos.get(`${label}:${id}`) ?? 99)
        : (standingPos.get(`${label}:${id}`) ?? 99);
    return [...list].sort(
      (a, b) => posOf(a.id) - posOf(b.id) || a.name.localeCompare(b.name),
    );
  }

  const now = new Date();

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Drag the 4 teams into your predicted finishing order. Each group locks at
        its own first kickoff. Top 2 (green) are the direct qualifiers.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {labels.map((label, i) => (
          <GroupSortable
            key={label}
            groupLabel={label}
            locked={isGroupLocked(firstKickoff.get(label) ?? null, now)}
            initial={order(label, byGroup.get(label)!)}
            accent={ACCENTS[i % ACCENTS.length]}
          />
        ))}
      </div>
    </div>
  );
}
