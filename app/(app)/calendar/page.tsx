import { createClient } from "@/lib/supabase/server";
import { CalendarView, type CalMatch } from "@/components/CalendarView";
import { LiveRefresh } from "@/components/LiveRefresh";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  kickoff: string;
  stage: string;
  group_label: string | null;
  venue: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home: { name: string; crest_url: string | null } | { name: string; crest_url: string | null }[] | null;
  away: { name: string; crest_url: string | null } | { name: string; crest_url: string | null }[] | null;
}

const one = (t: Row["home"]) => (Array.isArray(t) ? (t[0] ?? null) : t);

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: rawData }, { data: watch }] = await Promise.all([
    supabase
      .from("matches")
      .select(
        "id,kickoff,stage,group_label,venue,status,home_score,away_score," +
          "home:teams!matches_home_team_id_fkey(name,crest_url)," +
          "away:teams!matches_away_team_id_fkey(name,crest_url)",
      )
      .order("kickoff", { ascending: true }),
    supabase.from("watchlist").select("match_id").eq("user_id", user!.id),
  ]);

  const rows = (rawData ?? []) as unknown as Row[];
  const matches: CalMatch[] = rows.map((m) => {
    const h = one(m.home);
    const a = one(m.away);
    const k = new Date(m.kickoff);
    return {
      id: m.id,
      stage: m.stage,
      groupLabel: m.group_label,
      venue: m.venue,
      status: m.status,
      homeScore: m.home_score,
      awayScore: m.away_score,
      day: dayFmt.format(k),
      time: timeFmt.format(k),
      homeName: h?.name ?? "TBD",
      awayName: a?.name ?? "TBD",
      homeCrest: h?.crest_url ?? null,
      awayCrest: a?.crest_url ?? null,
    };
  });

  const watchedIds = (watch ?? []).map((w) => w.match_id as number);
  const hasLive = matches.some((m) => m.status === "live");

  return (
    <div>
      <LiveRefresh active={hasLive} />
      <h1 className="display rise text-6xl leading-[0.9] sm:text-7xl">
        THE
        <br />
        <span className="text-green">CALENDAR</span>
      </h1>
      <p className="mt-3 mb-5 max-w-md text-sm text-muted">
        All 104 fixtures. Star the ones you’ll watch and export them to your
        calendar — the .ics carries the exact UTC kickoff.
      </p>
      <CalendarView matches={matches} watchedIds={watchedIds} />
    </div>
  );
}
