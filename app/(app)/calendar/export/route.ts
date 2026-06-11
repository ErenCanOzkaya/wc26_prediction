import { createClient } from "@/lib/supabase/server";
import { buildIcs, type IcsEvent } from "@/lib/ics";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  group: "Group stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  third_place: "Third place",
  final: "Final",
};

interface MatchRow {
  id: number;
  kickoff: string;
  stage: string;
  venue: string | null;
  home: { name: string } | { name: string }[] | null;
  away: { name: string } | { name: string }[] | null;
}

const teamName = (t: MatchRow["home"]) => {
  if (!t) return "TBD";
  const one = Array.isArray(t) ? t[0] : t;
  return one?.name ?? "TBD";
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const matchId = new URL(request.url).searchParams.get("match");

  const select =
    "id,kickoff,stage,venue," +
    "home:teams!matches_home_team_id_fkey(name)," +
    "away:teams!matches_away_team_id_fkey(name)";

  let rows: MatchRow[];
  if (matchId) {
    const { data } = await supabase
      .from("matches")
      .select(select)
      .eq("id", Number(matchId))
      .maybeSingle();
    rows = data ? [data as unknown as MatchRow] : [];
  } else {
    // The user's watched matches.
    const { data: watch } = await supabase
      .from("watchlist")
      .select("match_id")
      .eq("user_id", user.id);
    const ids = (watch ?? []).map((w) => w.match_id);
    if (ids.length === 0) {
      rows = [];
    } else {
      const { data } = await supabase
        .from("matches")
        .select(select)
        .in("id", ids)
        .order("kickoff", { ascending: true });
      rows = (data ?? []) as unknown as MatchRow[];
    }
  }

  const events: IcsEvent[] = rows.map((m) => {
    const home = teamName(m.home);
    const away = teamName(m.away);
    const stage = STAGE_LABEL[m.stage] ?? m.stage;
    return {
      uid: `wc26-match-${m.id}@wc26-league`,
      start: m.kickoff,
      summary: `${home} vs ${away}`,
      location: m.venue ?? undefined,
      description: `${stage} — 2026 FIFA World Cup`,
    };
  });

  const ics = buildIcs(events);
  const filename = matchId ? `wc26-match-${matchId}.ics` : "wc26-watchlist.ics";

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
