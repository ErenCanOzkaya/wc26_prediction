import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/LiveRefresh";

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
const STATUS: Record<string, { label: string; color: string }> = {
  scheduled: { label: "Scheduled", color: "var(--color-muted)" },
  live: { label: "Live", color: "var(--color-red)" },
  finished: { label: "Full time", color: "var(--color-green)" },
  postponed: { label: "Postponed", color: "var(--color-sand)" },
  void: { label: "Void", color: "var(--color-muted)" },
};

interface Team {
  name: string;
  short_name: string | null;
  crest_url: string | null;
}
const one = <T,>(t: T | T[] | null): T | null =>
  Array.isArray(t) ? (t[0] ?? null) : t;

function Side({ team, score }: { team: Team | null; score: number | null }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/8">
        {team?.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.crest_url} alt="" className="h-9 w-9" />
        ) : (
          <span className="text-muted">?</span>
        )}
      </span>
      <span className="text-sm font-bold">{team?.name ?? "TBD"}</span>
      {score != null && <span className="display text-4xl">{score}</span>}
    </div>
  );
}

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const matchId = Number(id);
  if (!Number.isInteger(matchId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: matchData } = await supabase
    .from("matches")
    .select(
      "id,kickoff,venue,stage,group_label,status,home_score,away_score," +
        "home:teams!matches_home_team_id_fkey(name,short_name,crest_url)," +
        "away:teams!matches_away_team_id_fkey(name,short_name,crest_url)",
    )
    .eq("id", matchId)
    .maybeSingle();
  if (!matchData) notFound();
  const m = matchData as unknown as {
    id: number;
    kickoff: string;
    venue: string | null;
    stage: string;
    group_label: string | null;
    status: string;
    home_score: number | null;
    away_score: number | null;
    home: Team | Team[] | null;
    away: Team | Team[] | null;
  };
  const home = one(m.home);
  const away = one(m.away);

  // RLS returns my prediction plus every league-mate's prediction for this match.
  const [{ data: predsRaw }, { data: scoreRows }] = await Promise.all([
    supabase
      .from("match_predictions")
      .select("user_id,home_score,away_score,profiles(display_name)")
      .eq("match_id", matchId),
    supabase
      .from("scores")
      .select("user_id,points")
      .eq("category", "match")
      .eq("ref_id", String(matchId)),
  ]);
  const preds = (predsRaw ?? []) as unknown as {
    user_id: string;
    home_score: number;
    away_score: number;
    profiles: { display_name: string } | { display_name: string }[] | null;
  }[];
  const pointsByUser = new Map(
    (scoreRows ?? []).map((s) => [s.user_id, s.points as number]),
  );

  const hasResult = m.home_score != null && m.away_score != null;
  const status = STATUS[m.status] ?? STATUS.scheduled;

  const rows = preds
    .map((p) => {
      const prof = one(p.profiles);
      return {
        user_id: p.user_id,
        name: prof?.display_name ?? "Player",
        score: `${p.home_score}–${p.away_score}`,
        points: pointsByUser.get(p.user_id) ?? null,
        isMe: p.user_id === user?.id,
      };
    })
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

  return (
    <div className="mx-auto max-w-2xl">
      <LiveRefresh active={m.status === "live"} />
      <Link href="/calendar" className="text-sm text-muted hover:text-fg">
        ← Calendar
      </Link>

      <div className="surface mt-3 p-6">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold uppercase tracking-[0.2em] text-muted">
            {m.group_label
              ? `Group ${m.group_label}`
              : (STAGE_LABEL[m.stage] ?? m.stage)}
          </span>
          <span
            className="font-bold uppercase tracking-wide"
            style={{ color: status.color }}
          >
            {status.label}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <Side team={home} score={hasResult ? m.home_score : null} />
          <span className="display text-xl text-muted">vs</span>
          <Side team={away} score={hasResult ? m.away_score : null} />
        </div>

        <div className="mt-5 text-center text-sm text-muted">
          {new Date(m.kickoff).toLocaleString()}
          {m.venue ? ` · ${m.venue}` : ""}
        </div>
      </div>

      <h2 className="mt-6 mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Predictions{" "}
        <span className="ml-1 text-muted/70">
          ({rows.length} in your leagues)
        </span>
      </h2>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">No predictions for this match yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.user_id}
              className={`surface flex items-center gap-3 p-3 ${
                r.isMe ? "border-green/40" : ""
              }`}
            >
              <span className="flex-1 truncate font-bold">
                <Link href={`/members/${r.user_id}`} className="hover:text-green">
                  {r.name}
                </Link>
                {r.isMe && (
                  <span className="ml-2 rounded bg-green/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-green">
                    you
                  </span>
                )}
              </span>
              <span className="display text-lg">{r.score}</span>
              {r.points != null && (
                <span className="w-16 text-right text-sm font-bold text-green">
                  +{r.points}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
