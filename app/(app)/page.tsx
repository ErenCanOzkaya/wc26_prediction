import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Motif26 } from "@/components/Motif26";

const CATEGORIES = [
  { key: "match", label: "Match scores", color: "var(--color-green)" },
  { key: "matchday_bonus", label: "Matchday bonus", color: "var(--color-sand)" },
  { key: "group", label: "Group standings", color: "var(--color-navy)" },
  { key: "bracket", label: "Bracket", color: "var(--color-red)" },
  { key: "special", label: "Specials", color: "var(--color-green)" },
  { key: "xi", label: "Tournament XI", color: "var(--color-navy)" },
] as const;

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: nextMatchData } = await supabase
    .from("matches")
    .select(
      "id, kickoff, venue, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)",
    )
    .gt("kickoff", new Date().toISOString())
    .order("kickoff", { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextMatch = nextMatchData as {
    id: number;
    kickoff: string;
    venue: string | null;
    home: { name: string } | { name: string }[] | null;
    away: { name: string } | { name: string }[] | null;
  } | null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: profile }, { data: myScores }, { data: leagues }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle(),
      supabase.from("scores").select("category,points").eq("user_id", user!.id),
      supabase.from("leagues").select("id,name", { count: "exact" }),
    ]);

  const byCat = new Map<string, number>();
  for (const s of myScores ?? [])
    byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.points);
  const total = [...byCat.values()].reduce((a, b) => a + b, 0);
  const firstName = (profile?.display_name ?? "Player").split(/[.\s@]/)[0];

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="surface rise relative overflow-hidden p-6 sm:p-8">
        <Motif26 className="absolute -right-6 -top-10 rotate-12 opacity-90 sm:right-6 sm:opacity-100" />
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-green">
          We are 26
        </p>
        <h1 className="display mt-2 text-5xl sm:text-6xl">
          Hey, {firstName}.
        </h1>
        <div className="mt-6 flex items-end gap-3">
          <span className="display text-7xl leading-none sm:text-8xl">
            {total}
          </span>
          <span className="mb-2 text-sm uppercase tracking-widest text-muted">
            total points
          </span>
        </div>
      </section>

      {/* Category breakdown */}
      <section
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
        style={{ animationDelay: "60ms" }}
      >
        {CATEGORIES.map((c, i) => (
          <div
            key={c.key}
            className="surface rise relative overflow-hidden p-4"
            style={{ animationDelay: `${80 + i * 40}ms` }}
          >
            <span
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: c.color }}
            />
            <div className="display text-3xl">{byCat.get(c.key) ?? 0}</div>
            <div className="mt-1 text-xs text-muted">{c.label}</div>
          </div>
        ))}
      </section>

      {/* Action grid */}
      <section className="grid gap-3 md:grid-cols-3">
        <Link
          href="/predictions/matches"
          className="surface surface-hover rise group relative overflow-hidden p-6 md:col-span-2"
          style={{ animationDelay: "260ms" }}
        >
          <Motif26 className="absolute -bottom-12 -right-8 scale-90 opacity-30 transition group-hover:opacity-60" />
          <h2 className="display text-3xl">Make your predictions</h2>
          <p className="mt-2 max-w-md text-sm text-muted">
            Match scores, the 12 group tables, your full bracket and the
            tournament specials — lock them in before kickoff.
          </p>
          <span className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-green">
            Open predictions →
          </span>
        </Link>

        <div className="flex flex-col gap-3">
          {nextMatch ? (
            <Link
              href={`/matches/${nextMatch.id}`}
              className="surface surface-hover rise flex-1 p-5"
              style={{ animationDelay: "300ms" }}
            >
              <p className="text-xs font-bold uppercase tracking-widest text-muted">
                Next kickoff
              </p>
              <p className="mt-2 text-lg font-bold leading-tight">
                {teamName(nextMatch.home)}
                <br />
                <span className="text-muted">vs</span>{" "}
                {teamName(nextMatch.away)}
              </p>
              <p className="mt-2 text-xs text-muted">
                {new Date(nextMatch.kickoff).toLocaleString()}
              </p>
            </Link>
          ) : (
            <div
              className="surface rise flex-1 p-5"
              style={{ animationDelay: "300ms" }}
            >
              <p className="text-xs font-bold uppercase tracking-widest text-muted">
                Next kickoff
              </p>
              <p className="mt-2 text-sm text-muted">No upcoming match.</p>
            </div>
          )}
          <Link
            href="/leagues"
            className="surface surface-hover rise flex items-center justify-between p-5"
            style={{ animationDelay: "340ms" }}
          >
            <div>
              <div className="display text-2xl">{leagues?.length ?? 0}</div>
              <div className="text-xs text-muted">your leagues</div>
            </div>
            <span className="text-sm font-bold text-green">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function teamName(t: { name: string } | { name: string }[] | null): string {
  if (!t) return "TBD";
  const one = Array.isArray(t) ? t[0] : t;
  return one?.name ?? "TBD";
}
