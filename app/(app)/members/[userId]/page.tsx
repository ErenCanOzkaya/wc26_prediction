import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface TeamLite {
  id: number;
  name: string;
  short_name: string | null;
  crest_url: string | null;
}

function Flag({ team, size = 20 }: { team?: TeamLite | null; size?: number }) {
  if (!team?.crest_url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={team.crest_url}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  );
}

export default async function MemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();

  // RLS: returns rows only if you share a league with this user (or it's you).
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,country_team_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) notFound();

  const [
    { data: teamsData },
    { data: scoreRows },
    { data: gpreds },
    { data: bpreds },
    { data: special },
    { data: xi },
    { data: xiPicks },
  ] = await Promise.all([
    supabase.from("teams").select("id,name,short_name,crest_url"),
    supabase.from("scores").select("points").eq("user_id", userId),
    supabase
      .from("group_predictions")
      .select("group_label,team_id,position")
      .eq("user_id", userId),
    supabase
      .from("bracket_predictions")
      .select("slot_id,team_id")
      .eq("user_id", userId),
    supabase
      .from("special_predictions")
      .select("golden_boot_id,best_player_id,best_young_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("tournament_xi")
      .select("formation,captain_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("xi_picks").select("player_id").eq("user_id", userId),
  ]);

  const teams = new Map<number, TeamLite>(
    (teamsData ?? []).map((t) => [t.id, t as TeamLite]),
  );
  const total = (scoreRows ?? []).reduce((a, s) => a + (s.points as number), 0);
  const country = teams.get(profile.country_team_id ?? -1) ?? null;

  // Groups → ordered teams per group.
  const byGroup = new Map<string, { team: TeamLite | undefined; pos: number }[]>();
  for (const p of gpreds ?? []) {
    const arr = byGroup.get(p.group_label) ?? [];
    arr.push({ team: teams.get(p.team_id), pos: p.position });
    byGroup.set(p.group_label, arr);
  }
  for (const arr of byGroup.values()) arr.sort((a, b) => a.pos - b.pos);
  const groupLabels = [...byGroup.keys()].sort();

  // Bracket: champion / finalists / semifinalists from their winner slots.
  const win = new Map<number, number>();
  for (const b of bpreds ?? []) {
    if ((b.slot_id as string).startsWith("W"))
      win.set(Number((b.slot_id as string).slice(1)), b.team_id);
  }
  const t = (n: number | undefined) =>
    n != null ? teams.get(win.get(n) ?? -1) : undefined;
  const champion = t(104);
  const finalists = [t(101), t(102)];
  const semis = [t(97), t(98), t(99), t(100)];

  // Resolve player names/positions for specials + the Tournament XI.
  const xiPlayerIds = (xiPicks ?? []).map((p) => p.player_id as number);
  const playerIds = [
    special?.golden_boot_id,
    special?.best_player_id,
    special?.best_young_id,
    xi?.captain_id,
    ...xiPlayerIds,
  ].filter((v): v is number => v != null);
  let playerInfo = new Map<number, { name: string; position: string | null }>();
  if (playerIds.length) {
    const { data: pl } = await supabase
      .from("players")
      .select("id,name,position")
      .in("id", [...new Set(playerIds)]);
    playerInfo = new Map(
      (pl ?? []).map((p) => [
        p.id,
        { name: p.name as string, position: p.position as string | null },
      ]),
    );
  }
  const name = (id: number | null | undefined) =>
    id != null ? (playerInfo.get(id)?.name ?? "—") : "—";

  // Group the XI by pitch role.
  const ROLE: Record<string, string> = {
    Goalkeeper: "GK",
    Defence: "DEF",
    Midfield: "MID",
    Offence: "ATT",
  };
  const xiByRole: Record<string, number[]> = { GK: [], DEF: [], MID: [], ATT: [] };
  for (const pid of xiPlayerIds) {
    const role = ROLE[playerInfo.get(pid)?.position ?? ""] ?? "ATT";
    xiByRole[role].push(pid);
  }
  const teamName = (t?: TeamLite) => (t ? t.short_name || t.name : "—");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/leagues" className="text-sm text-muted hover:text-fg">
        ← Back
      </Link>

      {/* identity */}
      <div className="surface mt-3 flex items-center gap-4 p-5">
        <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/12 bg-white/5">
          {country?.crest_url ? (
            <Flag team={country} size={32} />
          ) : (
            <span className="display text-2xl">
              {profile.display_name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-3xl">{profile.display_name}</h1>
          <p className="text-sm text-muted">{country?.name ?? "—"}</p>
        </div>
        <div className="text-right">
          <div className="display text-3xl text-green">{total}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">
            points
          </div>
        </div>
      </div>

      {/* Bracket summary */}
      <h2 className="mt-7 mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Bracket
      </h2>
      <div className="surface flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Champion
          </div>
          <div className="display mt-1 flex items-center gap-2 text-2xl text-green">
            <Flag team={champion} size={24} />
            {teamName(champion)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Finalists
          </div>
          <div className="mt-1 font-bold">
            {teamName(finalists[0])} <span className="text-muted">vs</span>{" "}
            {teamName(finalists[1])}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Semi-finalists
          </div>
          <div className="mt-1 text-sm text-muted">
            {semis.map(teamName).join(" · ")}
          </div>
        </div>
      </div>

      {/* Specials */}
      <h2 className="mt-7 mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Specials
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Golden Boot", special?.golden_boot_id],
          ["Best Player", special?.best_player_id],
          ["Best Young", special?.best_young_id],
        ].map(([label, pid]) => (
          <div key={label as string} className="surface p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted">
              {label}
            </div>
            <div className="mt-1 font-bold">{name(pid as number | null)}</div>
          </div>
        ))}
      </div>

      {/* Tournament XI */}
      <h2 className="mt-7 mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Tournament XI
        {xi?.formation && (
          <span className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-fg">
            {xi.formation}
          </span>
        )}
      </h2>
      {xiPlayerIds.length === 0 ? (
        <p className="text-sm text-muted">No XI picked yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          {(["GK", "DEF", "MID", "ATT"] as const).map((role) => (
            <div key={role} className="surface p-3">
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-green">
                {role}
              </div>
              <ul className="space-y-1">
                {xiByRole[role].map((pid) => (
                  <li key={pid} className="flex items-center gap-1.5 text-sm">
                    <span className="truncate font-medium">{name(pid)}</span>
                    {xi?.captain_id === pid && (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green text-[9px] font-bold text-bg">
                        C
                      </span>
                    )}
                  </li>
                ))}
                {xiByRole[role].length === 0 && (
                  <li className="text-xs text-muted">—</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Groups */}
      <h2 className="mt-7 mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Group standings
      </h2>
      {groupLabels.length === 0 ? (
        <p className="text-sm text-muted">No group predictions yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groupLabels.map((g) => (
            <div key={g} className="surface p-3">
              <div className="display mb-2 text-lg">Group {g}</div>
              <ol className="space-y-1">
                {byGroup.get(g)!.map((row, i) => (
                  <li
                    key={row.team?.id ?? i}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                        i < 2 ? "bg-green/20 text-green" : "bg-white/8 text-muted"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <Flag team={row.team} size={16} />
                    <span className="truncate font-medium">
                      {teamName(row.team)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
