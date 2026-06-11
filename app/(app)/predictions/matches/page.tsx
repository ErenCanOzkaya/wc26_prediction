import { createClient } from "@/lib/supabase/server";
import { isMatchLocked } from "@/lib/locks";
import { LiveRefresh } from "@/components/LiveRefresh";
import {
  MatchPredictionRow,
  type MatchRowData,
  type TeamLite,
} from "@/components/MatchPredictionRow";

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

interface RawMatchRow {
  id: number;
  kickoff: string;
  stage: string;
  group_label: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  home: TeamLite | TeamLite[] | null;
  away: TeamLite | TeamLite[] | null;
}

function one(t: TeamLite | TeamLite[] | null): TeamLite | null {
  if (!t) return null;
  return Array.isArray(t) ? (t[0] ?? null) : t;
}

const dayFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function MatchPredictionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: rawMatchesData } = await supabase
    .from("matches")
    .select(
      "id,kickoff,stage,group_label,status,home_score,away_score," +
        "home:teams!matches_home_team_id_fkey(id,name,short_name,crest_url)," +
        "away:teams!matches_away_team_id_fkey(id,name,short_name,crest_url)",
    )
    .order("kickoff", { ascending: true });

  // The supabase type-level select parser can't resolve the FK-hint embeds, so
  // we narrow the runtime-correct shape ourselves.
  const rawMatches = (rawMatchesData ?? []) as unknown as RawMatchRow[];

  const { data: preds } = await supabase
    .from("match_predictions")
    .select("match_id,home_score,away_score")
    .eq("user_id", user!.id);

  const predById = new Map(
    (preds ?? []).map((p) => [p.match_id, p as { home_score: number; away_score: number }]),
  );

  const ACCENTS = [
    "var(--color-green)",
    "var(--color-navy)",
    "var(--color-red)",
    "var(--color-sand)",
  ];

  // Only matches with both teams decided are predictable; group by calendar day.
  const now = new Date();
  const sections: { day: string; rows: MatchRowData[] }[] = [];
  let openCount = 0;
  let i = 0;

  for (const m of rawMatches ?? []) {
    const home = one(m.home as TeamLite | TeamLite[] | null);
    const away = one(m.away as TeamLite | TeamLite[] | null);
    if (!home || !away) continue; // knockout TBD — opens when teams resolve

    const locked = isMatchLocked(m.kickoff, now);
    if (!locked) openCount++;
    const pred = predById.get(m.id);
    const kickoff = new Date(m.kickoff);

    const row: MatchRowData = {
      id: m.id,
      time: timeFmt.format(kickoff),
      meta: m.group_label
        ? `Group ${m.group_label}`
        : (STAGE_LABEL[m.stage] ?? m.stage),
      accent: ACCENTS[i++ % ACCENTS.length],
      locked,
      status: m.status,
      home,
      away,
      resultHome: m.home_score,
      resultAway: m.away_score,
      predHome: pred?.home_score ?? null,
      predAway: pred?.away_score ?? null,
    };

    const day = dayFmt.format(kickoff);
    const last = sections[sections.length - 1];
    if (last && last.day === day) last.rows.push(row);
    else sections.push({ day, rows: [row] });
  }

  const hasLive = (rawMatches ?? []).some((m) => m.status === "live");

  return (
    <div>
      <LiveRefresh active={hasLive} />
      <p className="mb-5 text-sm text-muted">
        <span className="font-bold text-fg">{openCount}</span> match
        {openCount === 1 ? "" : "es"} still open. Scores save automatically.
        Knockout matches open once the teams are decided.
      </p>

      <div className="space-y-7">
        {sections.map((s) => (
          <section key={s.day}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted">
              <span className="h-px flex-1 bg-white/8" />
              {s.day}
              <span className="h-px flex-1 bg-white/8" />
            </h3>
            <div className="space-y-2">
              {s.rows.map((row) => (
                <MatchPredictionRow key={row.id} match={row} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
