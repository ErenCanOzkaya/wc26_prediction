import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TrophyIcon } from "@/components/TrophyIcon";
import { LeagueActions } from "@/components/LeagueActions";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { key: "match", label: "Match", color: "var(--color-green)" },
  { key: "matchday_bonus", label: "MD bonus", color: "var(--color-sand)" },
  { key: "group", label: "Groups", color: "var(--color-navy)" },
  { key: "bracket", label: "Bracket", color: "var(--color-red)" },
  { key: "special", label: "Specials", color: "#7e8cff" },
  { key: "xi", label: "XI", color: "#e0b341" },
] as const;

const RANK_COLOR = ["var(--color-green)", "var(--color-sand)", "var(--color-red)"];

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: league } = await supabase
    .from("leagues")
    .select("id,name,invite_code,owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!league) notFound();
  const isOwner = league.owner_id === user?.id;

  const { data: membersRaw } = await supabase
    .from("league_members")
    .select("user_id,role,profiles(display_name)")
    .eq("league_id", id);
  const members = (membersRaw ?? []) as unknown as {
    user_id: string;
    role: string;
    profiles: { display_name: string } | { display_name: string }[] | null;
  }[];

  const memberIds = members.map((m) => m.user_id);
  const { data: scores } = await supabase
    .from("scores")
    .select("user_id,category,points")
    .in(
      "user_id",
      memberIds.length ? memberIds : ["00000000-0000-0000-0000-000000000000"],
    );

  const agg = new Map<string, { total: number; cats: Record<string, number> }>();
  for (const m of members) agg.set(m.user_id, { total: 0, cats: {} });
  for (const s of scores ?? []) {
    const a = agg.get(s.user_id);
    if (!a) continue;
    a.total += s.points;
    a.cats[s.category] = (a.cats[s.category] ?? 0) + s.points;
  }

  const name = (m: (typeof members)[number]) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return p?.display_name ?? "Player";
  };

  const rows = members
    .map((m) => ({
      user_id: m.user_id,
      name: name(m),
      role: m.role,
      ...agg.get(m.user_id)!,
    }))
    .sort((a, b) => b.total - a.total);

  const ranked: (((typeof rows)[number]) & { rank: number })[] = [];
  for (let i = 0; i < rows.length; i++) {
    const prev = ranked[i - 1];
    const rank = prev && prev.total === rows[i].total ? prev.rank : i + 1;
    ranked.push({ ...rows[i], rank });
  }

  return (
    <div>
      <Link href="/leagues" className="text-sm text-muted hover:text-fg">
        ← Leagues
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="display rise text-5xl sm:text-6xl">{league.name}</h1>
        <span className="text-sm text-muted">
          Invite code{" "}
          <span className="rounded-md bg-white/8 px-2 py-0.5 font-mono font-bold tracking-widest text-fg">
            {league.invite_code}
          </span>
        </span>
      </div>

      <div className="mt-4">
        <LeagueActions leagueId={league.id} isOwner={isOwner} />
      </div>

      <div className="mt-6 space-y-2">
        {ranked.map((r) => {
          const isTop = r.rank <= 3;
          const badge = RANK_COLOR[r.rank - 1];
          return (
            <div
              key={r.user_id}
              className="surface relative overflow-hidden p-4"
            >
              {isTop && (
                <span
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ background: badge }}
                />
              )}
              <div className="flex items-center gap-3 pl-1.5">
                {/* rank */}
                <div className="flex w-9 shrink-0 items-center justify-center">
                  {r.rank === 1 ? (
                    <TrophyIcon className="h-6 w-6 text-green" />
                  ) : (
                    <span
                      className="display text-2xl"
                      style={{ color: isTop ? badge : "var(--color-muted)" }}
                    >
                      {r.rank}
                    </span>
                  )}
                </div>

                {/* name + breakdown */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/members/${r.user_id}`}
                      className="truncate font-bold hover:text-green"
                    >
                      {r.name}
                    </Link>
                    {r.role === "owner" && (
                      <span className="rounded bg-white/8 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted">
                        owner
                      </span>
                    )}
                  </div>
                  {/* category bar */}
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/6">
                    {r.total > 0 &&
                      CATEGORIES.map((c) => {
                        const v = r.cats[c.key] ?? 0;
                        if (v <= 0) return null;
                        return (
                          <span
                            key={c.key}
                            title={`${c.label}: ${v}`}
                            style={{
                              width: `${(v / r.total) * 100}%`,
                              background: c.color,
                            }}
                          />
                        );
                      })}
                  </div>
                </div>

                {/* total */}
                <div className="shrink-0 text-right">
                  <div className="display text-2xl leading-none">{r.total}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    pts
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
        {CATEGORIES.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: c.color }}
            />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
