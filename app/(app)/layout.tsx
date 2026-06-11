import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "@/components/AppHeader";
import { MainNav } from "@/components/MainNav";
import type { CountryOption } from "@/components/ProfileCard";

interface MatchLite {
  kickoff: string;
  home: { name: string } | { name: string }[] | null;
  away: { name: string } | { name: string }[] | null;
}
const MATCH_SELECT =
  "kickoff,home:teams!matches_home_team_id_fkey(name),away:teams!matches_away_team_id_fkey(name)";
const teamName = (t: MatchLite["home"]) => {
  if (!t) return "TBD";
  const one = Array.isArray(t) ? t[0] : t;
  return one?.name ?? "TBD";
};
const label = (m: MatchLite | null) =>
  m ? `${teamName(m.home)} vs ${teamName(m.away)}` : null;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nowIso = new Date().toISOString();

  const [
    { data: profile },
    { data: nextOverall },
    { data: scores },
    { count: leaguesCount },
    { data: countriesData },
    { data: watch },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name,country_team_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("matches")
      .select(MATCH_SELECT)
      .gt("kickoff", nowIso)
      .order("kickoff", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("scores").select("points").eq("user_id", user.id),
    supabase.from("leagues").select("id", { count: "exact", head: true }),
    supabase
      .from("teams")
      .select("id,name,crest_url")
      .not("group_label", "is", null)
      .order("name", { ascending: true }),
    supabase.from("watchlist").select("match_id").eq("user_id", user.id),
  ]);

  // Prefer the user's next WATCHED match; fall back to the next match overall.
  const watchedIds = (watch ?? []).map((w) => w.match_id);
  let nextWatched: MatchLite | null = null;
  if (watchedIds.length) {
    const { data } = await supabase
      .from("matches")
      .select(MATCH_SELECT)
      .in("id", watchedIds)
      .gt("kickoff", nowIso)
      .order("kickoff", { ascending: true })
      .limit(1)
      .maybeSingle();
    nextWatched = data as unknown as MatchLite | null;
  }

  const overall = nextOverall as unknown as MatchLite | null;
  const countdown = nextWatched
    ? { target: nextWatched.kickoff, caption: "Your match in", label: label(nextWatched) }
    : overall
      ? { target: overall.kickoff, caption: "Kickoff in", label: label(overall) }
      : { target: null, caption: "Kickoff in", label: null };

  const displayName = profile?.display_name ?? user.email ?? "Player";
  const points = (scores ?? []).reduce((a, s) => a + (s.points as number), 0);
  const countries = (countriesData ?? []) as CountryOption[];
  const country =
    countries.find((c) => c.id === profile?.country_team_id) ?? null;

  return (
    <>
      <AppHeader
        displayName={displayName}
        countdownTarget={countdown.target}
        countdownCaption={countdown.caption}
        countdownLabel={countdown.label}
        points={points}
        leagues={leaguesCount ?? 0}
        country={country}
        countries={countries}
      />
      <MainNav />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </div>
    </>
  );
}
