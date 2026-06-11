import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  footballDataProvider,
  type FootballProvider,
  type ProviderMatch,
  type ProviderStage,
  type ProviderStatus,
} from "@/lib/football";
import { BRACKET, type R32Source, type FeederSource } from "@/lib/bracket/structure";
import { recomputeAll, type RecomputeSummary } from "@/lib/scoring/recompute";

/**
 * The poller (API.md §4). Maps provider data into our DB behind the service-role
 * client. Idempotent: every write is an upsert keyed by the provider id, so
 * re-running never duplicates. The UI only ever reads our DB.
 */

// ---- Normalization (provider -> our enums) ----

const STAGE_MAP: Record<ProviderStage, string> = {
  GROUP_STAGE: "group",
  LAST_32: "r32",
  LAST_16: "r16",
  QUARTER_FINALS: "qf",
  SEMI_FINALS: "sf",
  THIRD_PLACE: "third_place",
  FINAL: "final",
};

const STATUS_MAP: Record<ProviderStatus, string> = {
  SCHEDULED: "scheduled",
  TIMED: "scheduled",
  IN_PLAY: "live",
  PAUSED: "live",
  FINISHED: "finished",
  AWARDED: "finished",
  SUSPENDED: "postponed",
  POSTPONED: "postponed",
  CANCELLED: "void",
};

/** "GROUP_A" -> "A"; null for knockout. */
function groupLabel(group: string | null): string | null {
  if (!group) return null;
  return group.replace("GROUP_", "").trim() || null;
}

/** Resolve the post-penalties winner team id (null for draws / unresolved). */
function winnerTeamId(m: ProviderMatch): number | null {
  if (m.score.winner === "HOME_TEAM") return m.homeTeam.id;
  if (m.score.winner === "AWAY_TEAM") return m.awayTeam.id;
  return null;
}

interface MatchRow {
  id: number;
  stage: string;
  group_label: string | null;
  matchday: number | null;
  kickoff: string;
  venue: string | null;
  home_team_id: number | null;
  away_team_id: number | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: number | null;
  status: string;
  updated_at: string;
}

function mapMatchToRow(m: ProviderMatch, now: string): MatchRow {
  return {
    id: m.id,
    stage: STAGE_MAP[m.stage],
    group_label: groupLabel(m.group),
    matchday: m.matchday,
    kickoff: m.utcDate,
    venue: m.venue,
    home_team_id: m.homeTeam.id,
    away_team_id: m.awayTeam.id,
    home_score: m.score.fullTime.home,
    away_score: m.score.fullTime.away,
    winner_team_id: winnerTeamId(m),
    status: STATUS_MAP[m.status],
    updated_at: now,
  };
}

export interface PollSummary {
  teamsSynced: number;
  playersSynced: number;
  matchesSynced: number;
  standingsSynced: number;
  bracketSlotsSeeded: number;
  scorersSynced: number;
  /** Match ids that transitioned to 'finished' on THIS poll (scoring hook). */
  newlyFinished: number[];
  /** True when the last group match flipped to finished on THIS poll. */
  groupStageJustCompleted: boolean;
  liveCount: number;
  recompute: RecomputeSummary | null;
  durationMs: number;
}

type Db = ReturnType<typeof createAdminClient>;

async function syncTeamsAndPlayers(
  db: Db,
  provider: FootballProvider,
  groupByTeam: Map<number, string>,
): Promise<{ teams: number; players: number }> {
  const teams = await provider.getTeams();

  const teamRows = teams.map((t) => ({
    id: t.id,
    name: t.name,
    short_name: t.shortName,
    group_label: groupByTeam.get(t.id) ?? null,
    crest_url: t.crest,
  }));
  const { error: teamErr } = await db
    .from("teams")
    .upsert(teamRows, { onConflict: "id" });
  if (teamErr) throw new Error(`teams upsert: ${teamErr.message}`);

  const playerRows = teams.flatMap((t) =>
    t.squad.map((p) => ({
      id: p.id,
      name: p.name,
      team_id: t.id,
      date_of_birth: p.dateOfBirth,
      position: p.position,
    })),
  );
  if (playerRows.length) {
    const { error: playerErr } = await db
      .from("players")
      .upsert(playerRows, { onConflict: "id" });
    if (playerErr) throw new Error(`players upsert: ${playerErr.message}`);
  }

  return { teams: teamRows.length, players: playerRows.length };
}

async function syncStandings(
  db: Db,
  provider: FootballProvider,
): Promise<number> {
  const standings = await provider.getStandings();
  const rows = standings.flatMap((s) => {
    const label = s.group.replace("Group ", "").trim();
    return s.rows.map((r) => ({
      group_label: label,
      team_id: r.teamId,
      position: r.position,
      played: r.played,
      points: r.points,
      goal_diff: r.goalDifference,
      goals_for: r.goalsFor,
      // Top 2 qualify directly; the 8-best-3rd mechanic is resolved via the
      // bracket, not here (SCORING §2), so 3rd/4th stay null.
      qualified: r.position <= 2 ? "direct" : null,
    }));
  });
  if (rows.length) {
    const { error } = await db
      .from("group_standings")
      .upsert(rows, { onConflict: "group_label,team_id" });
    if (error) throw new Error(`group_standings upsert: ${error.message}`);
  }
  return rows.length;
}

function sourceLabel(s: R32Source | FeederSource): string {
  switch (s.type) {
    case "winnerOf":
      return `W${s.match}`;
    case "winner":
      return `winner:${s.group}`;
    case "runnerup":
      return `runnerup:${s.group}`;
    case "third":
      return `third:${s.groups.join("/")}`;
  }
}

/**
 * Seed the static bracket structure into bracket_slots so bracket_predictions
 * (FK on slot_id) can reference it. `W{n}` = winner of match n; `E{n}` = the
 * third-placed entrant of R32 match n. team_id is resolved later from results.
 */
async function seedBracketSlots(db: Db): Promise<number> {
  const rows: {
    id: string;
    stage: string;
    source_a: string | null;
    source_b: string | null;
  }[] = [];
  for (const m of BRACKET) {
    rows.push({
      id: `W${m.match}`,
      stage: m.stage,
      source_a: sourceLabel(m.a),
      source_b: sourceLabel(m.b),
    });
    if (m.a.type === "third")
      rows.push({ id: `E${m.match}`, stage: "r32", source_a: sourceLabel(m.a), source_b: null });
    if (m.b.type === "third")
      rows.push({ id: `E${m.match}`, stage: "r32", source_a: sourceLabel(m.b), source_b: null });
  }
  const { error } = await db
    .from("bracket_slots")
    .upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`bracket_slots upsert: ${error.message}`);
  return rows.length;
}

async function syncScorers(
  db: Db,
  provider: FootballProvider,
): Promise<number> {
  const scorers = await provider.getScorers(50);
  const rows = scorers.map((s) => ({
    player_id: s.playerId,
    player_name: s.playerName,
    team_id: s.teamId,
    goals: s.goals,
    assists: s.assists,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length) {
    const { error } = await db
      .from("scorers")
      .upsert(rows, { onConflict: "player_id" });
    if (error) throw new Error(`scorers upsert: ${error.message}`);
  }
  return rows.length;
}

/**
 * Run one poll cycle. On the first run (teams table not yet populated) it also
 * syncs teams + players, since matches FK-reference teams.
 */
export async function pollOnce(
  provider: FootballProvider = footballDataProvider,
): Promise<PollSummary> {
  const startedAt = Date.now();
  const now = new Date(startedAt).toISOString();
  const db = createAdminClient();

  // 1. Fetch the match feed (also gives us each team's group).
  const matches = await provider.getMatches();
  const groupByTeam = new Map<number, string>();
  for (const m of matches) {
    const label = groupLabel(m.group);
    if (label && m.homeTeam.id) groupByTeam.set(m.homeTeam.id, label);
    if (label && m.awayTeam.id) groupByTeam.set(m.awayTeam.id, label);
  }

  // 2. Ensure teams/players exist before inserting matches (FK dependency).
  const { count: teamCount } = await db
    .from("teams")
    .select("*", { count: "exact", head: true });
  // Teams + players are static (group labels are set once here). Squads are only
  // re-pulled if the table isn't fully populated, to spare the rate budget.
  let teamsSynced = 0;
  let playersSynced = 0;
  if ((teamCount ?? 0) < 48) {
    const r = await syncTeamsAndPlayers(db, provider, groupByTeam);
    teamsSynced = r.teams;
    playersSynced = r.players;
  }

  // 3. Detect status transitions for the scoring hook (compare before/after).
  const { data: existing } = await db
    .from("matches")
    .select("id,status,stage");
  const prevStatus = new Map<number, string>(
    (existing ?? []).map((r) => [r.id as number, r.status as string]),
  );

  // 4. Upsert all matches.
  const matchRows = matches.map((m) => mapMatchToRow(m, now));
  const { error: matchErr } = await db
    .from("matches")
    .upsert(matchRows, { onConflict: "id" });
  if (matchErr) throw new Error(`matches upsert: ${matchErr.message}`);

  // 5. Standings.
  const standingsSynced = await syncStandings(db, provider);

  // 5b. Seed the static bracket structure once.
  const { count: slotCount } = await db
    .from("bracket_slots")
    .select("id", { count: "exact", head: true });
  let bracketSlotsSeeded = 0;
  if ((slotCount ?? 0) === 0) {
    bracketSlotsSeeded = await seedBracketSlots(db);
  }

  // 6. Compute transition events.
  const newlyFinished: number[] = [];
  for (const row of matchRows) {
    const before = prevStatus.get(row.id);
    if (row.status === "finished" && before !== "finished") {
      newlyFinished.push(row.id);
    }
  }
  const groupRows = matchRows.filter((r) => r.stage === "group");
  const groupAllFinished =
    groupRows.length > 0 && groupRows.every((r) => r.status === "finished");
  const someGroupNewlyFinished = newlyFinished.some((id) =>
    groupRows.find((r) => r.id === id),
  );
  const groupStageJustCompleted = groupAllFinished && someGroupNewlyFinished;

  const liveCount = matchRows.filter((r) => r.status === "live").length;

  // 7. On any finish, refresh scorers and recompute scores (idempotent).
  let scorersSynced = 0;
  let recompute: RecomputeSummary | null = null;
  if (newlyFinished.length > 0 || groupStageJustCompleted) {
    scorersSynced = await syncScorers(db, provider);
    recompute = await recomputeAll(db);
  }

  return {
    teamsSynced,
    playersSynced,
    matchesSynced: matchRows.length,
    standingsSynced,
    bracketSlotsSeeded,
    scorersSynced,
    newlyFinished,
    groupStageJustCompleted,
    liveCount,
    recompute,
    durationMs: Date.now() - startedAt,
  };
}
