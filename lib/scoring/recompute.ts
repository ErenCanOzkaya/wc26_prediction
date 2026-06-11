import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  scoreMatch,
  scoreGroup,
  scoreBracketBase,
  scoreSpecials,
  scoreTournamentXi,
  perfectMatchdayBonus,
  predictedBracketRanks,
  type Score,
  type GroupPositions,
  type BracketRanks,
} from "@/lib/scoring/engine";

type Db = ReturnType<typeof createAdminClient>;

interface ScoreRow {
  user_id: string;
  category: string;
  ref_id: string;
  points: number;
  computed_at: string;
}

async function upsertScores(db: Db, rows: ScoreRow[]) {
  if (!rows.length) return;
  // PostgREST caps payload sizes; chunk to stay safe with many users.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("scores")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,category,ref_id" });
    if (error) throw new Error(`scores upsert: ${error.message}`);
  }
}

/** Match results + the perfect-matchday bonus. */
async function recomputeMatches(db: Db, now: string): Promise<number> {
  const [{ data: matches }, { data: preds }] = await Promise.all([
    db.from("matches").select("id,kickoff,status,home_score,away_score"),
    db
      .from("match_predictions")
      .select("user_id,match_id,home_score,away_score,updated_at"),
  ]);
  const mById = new Map((matches ?? []).map((m) => [m.id, m]));

  const rows: ScoreRow[] = [];
  // user|day -> finished predictions for the matchday bonus
  const byDay = new Map<string, { pred: Score; result: Score }[]>();
  const dayComplete = new Map<string, boolean>();

  for (const p of preds ?? []) {
    const m = mById.get(p.match_id);
    if (!m) continue;
    // Defensive lock (SCORING §5): ignore predictions edited after kickoff.
    if (new Date(p.updated_at) > new Date(m.kickoff)) continue;

    const day = (m.kickoff as string).slice(0, 10);
    const key = `${p.user_id}|${day}`;
    const finished =
      m.status === "finished" && m.home_score != null && m.away_score != null;

    if (!finished) {
      dayComplete.set(key, false);
    } else if (!dayComplete.has(key)) {
      dayComplete.set(key, true);
    }

    if (finished) {
      const pred: Score = { home: p.home_score, away: p.away_score };
      const result: Score = { home: m.home_score, away: m.away_score };
      rows.push({
        user_id: p.user_id,
        category: "match",
        ref_id: String(p.match_id),
        points: scoreMatch(pred, result),
        computed_at: now,
      });
      const arr = byDay.get(key) ?? [];
      arr.push({ pred, result });
      byDay.set(key, arr);
    }
  }

  // Matchday bonus: only when every predicted match that day is finished.
  for (const [key, list] of byDay) {
    const [user_id, day] = key.split("|");
    const points = dayComplete.get(key) ? perfectMatchdayBonus(list) : 0;
    rows.push({
      user_id,
      category: "matchday_bonus",
      ref_id: day,
      points,
      computed_at: now,
    });
  }

  await upsertScores(db, rows);
  return rows.length;
}

/** Group standings — only scored once a group's matches are all finished. */
async function recomputeGroups(db: Db, now: string): Promise<number> {
  const [{ data: matches }, { data: standings }, { data: preds }] =
    await Promise.all([
      db
        .from("matches")
        .select("group_label,status")
        .eq("stage", "group"),
      db.from("group_standings").select("group_label,team_id,position"),
      db
        .from("group_predictions")
        .select("user_id,group_label,team_id,position"),
    ]);

  // Which groups are fully decided?
  const groupMatches = new Map<string, { total: number; finished: number }>();
  for (const m of matches ?? []) {
    if (!m.group_label) continue;
    const g = groupMatches.get(m.group_label) ?? { total: 0, finished: 0 };
    g.total++;
    if (m.status === "finished") g.finished++;
    groupMatches.set(m.group_label, g);
  }
  const settled = new Set(
    [...groupMatches.entries()]
      .filter(([, v]) => v.total > 0 && v.finished === v.total)
      .map(([k]) => k),
  );

  const finalByGroup = new Map<string, GroupPositions>();
  for (const s of standings ?? []) {
    if (!settled.has(s.group_label)) continue;
    const fp = finalByGroup.get(s.group_label) ?? {};
    fp[s.team_id] = s.position;
    finalByGroup.set(s.group_label, fp);
  }

  const predByUserGroup = new Map<string, GroupPositions>();
  for (const p of preds ?? []) {
    if (!settled.has(p.group_label)) continue;
    const key = `${p.user_id}|${p.group_label}`;
    const gp = predByUserGroup.get(key) ?? {};
    gp[p.team_id] = p.position;
    predByUserGroup.set(key, gp);
  }

  const rows: ScoreRow[] = [];
  for (const [key, predPos] of predByUserGroup) {
    const [user_id, group] = key.split("|");
    const finalPos = finalByGroup.get(group);
    if (!finalPos) continue;
    rows.push({
      user_id,
      category: "group",
      ref_id: group,
      points: scoreGroup(predPos, finalPos),
      computed_at: now,
    });
  }

  await upsertScores(db, rows);
  return rows.length;
}

/** Official deepest bracket rank per team, from resolved knockout matches. */
async function officialBracketRanks(db: Db): Promise<BracketRanks> {
  const { data: matches } = await db
    .from("matches")
    .select("stage,home_team_id,away_team_id,winner_team_id,status")
    .in("stage", ["r32", "r16", "qf", "sf", "final"]);
  const rankOf: Record<string, number> = {
    r32: 1,
    r16: 2,
    qf: 3,
    sf: 4,
    final: 5,
  };
  const ranks: BracketRanks = {};
  for (const m of matches ?? []) {
    const r = rankOf[m.stage];
    for (const t of [m.home_team_id, m.away_team_id]) {
      if (t != null) ranks[t] = Math.max(ranks[t] ?? 0, r);
    }
    if (m.stage === "final" && m.winner_team_id != null) {
      ranks[m.winner_team_id] = 6; // champion
    }
  }
  return ranks;
}

/**
 * Bracket BASE scoring. Slot bonuses are intentionally NOT awarded yet — they
 * need the FIFA-match ↔ provider-match-id alignment, which is built once the
 * knockout teams resolve (tracked in bracket-model memory).
 */
async function recomputeBracket(db: Db, now: string): Promise<number> {
  const official = await officialBracketRanks(db);
  if (Object.keys(official).length === 0) return 0; // nothing resolved yet

  const [{ data: gpreds }, { data: bpreds }] = await Promise.all([
    db.from("group_predictions").select("user_id,group_label,team_id,position"),
    db.from("bracket_predictions").select("user_id,slot_id,team_id"),
  ]);

  // Seeds per user from group predictions (1st/2nd/3rd).
  const seeds = new Map<
    string,
    Record<string, { winner?: number; runnerup?: number; third?: number }>
  >();
  for (const p of gpreds ?? []) {
    const u = seeds.get(p.user_id) ?? {};
    const g = (u[p.group_label] ??= {});
    if (p.position === 1) g.winner = p.team_id;
    else if (p.position === 2) g.runnerup = p.team_id;
    else if (p.position === 3) g.third = p.team_id;
    u[p.group_label] = g;
    seeds.set(p.user_id, u);
  }

  // Winners / thirds per user from bracket predictions.
  const picksByUser = new Map<
    string,
    { winners: Record<number, number>; thirds: Record<number, number> }
  >();
  for (const b of bpreds ?? []) {
    const u =
      picksByUser.get(b.user_id) ?? { winners: {}, thirds: {} };
    const n = parseInt((b.slot_id as string).slice(1), 10);
    if ((b.slot_id as string).startsWith("W")) u.winners[n] = b.team_id;
    else if ((b.slot_id as string).startsWith("E")) u.thirds[n] = b.team_id;
    picksByUser.set(b.user_id, u);
  }

  const users = new Set([...seeds.keys(), ...picksByUser.keys()]);
  const rows: ScoreRow[] = [];
  for (const user_id of users) {
    const picks = picksByUser.get(user_id) ?? { winners: {}, thirds: {} };
    const predicted = predictedBracketRanks({
      seeds: seeds.get(user_id) ?? {},
      winners: picks.winners,
      thirds: picks.thirds,
    });
    rows.push({
      user_id,
      category: "bracket",
      ref_id: "bracket",
      points: scoreBracketBase(predicted, official),
      computed_at: now,
    });
  }

  await upsertScores(db, rows);
  return rows.length;
}

/** Tournament specials. Golden Boot from scorers; Best/Young from admin results. */
async function recomputeSpecials(db: Db, now: string): Promise<number> {
  const [{ data: scorers }, { data: results }, { data: preds }] =
    await Promise.all([
      db
        .from("scorers")
        .select("player_id,goals")
        .order("goals", { ascending: false })
        .limit(1),
      db
        .from("tournament_results")
        .select("golden_boot_id,best_player_id,best_young_id")
        .maybeSingle(),
      db
        .from("special_predictions")
        .select("user_id,golden_boot_id,best_player_id,best_young_id"),
    ]);

  const actual = {
    goldenBoot:
      results?.golden_boot_id ?? (scorers?.[0]?.player_id ?? null),
    bestPlayer: results?.best_player_id ?? null,
    bestYoung: results?.best_young_id ?? null,
  };
  if (
    actual.goldenBoot == null &&
    actual.bestPlayer == null &&
    actual.bestYoung == null
  ) {
    return 0; // nothing resolved yet
  }

  const rows: ScoreRow[] = (preds ?? []).map((p) => ({
    user_id: p.user_id,
    category: "special",
    ref_id: "special",
    points: scoreSpecials(
      {
        goldenBoot: p.golden_boot_id,
        bestPlayer: p.best_player_id,
        bestYoung: p.best_young_id,
      },
      actual,
    ),
    computed_at: now,
  }));

  await upsertScores(db, rows);
  return rows.length;
}

/** Tournament XI. Scored only once the admin sets the actual Golden XI. */
async function recomputeXi(db: Db, now: string): Promise<number> {
  const { data: results } = await db
    .from("tournament_results")
    .select("golden_xi")
    .maybeSingle();
  const golden = (results?.golden_xi ?? []) as number[];
  if (!golden.length) return 0;
  const goldenSet = new Set(golden);

  const [{ data: xi }, { data: picks }] = await Promise.all([
    db.from("tournament_xi").select("user_id,captain_id"),
    db.from("xi_picks").select("user_id,player_id"),
  ]);

  const captainByUser = new Map(
    (xi ?? []).map((r) => [r.user_id, r.captain_id as number | null]),
  );
  const picksByUser = new Map<string, number[]>();
  for (const p of picks ?? []) {
    const arr = picksByUser.get(p.user_id) ?? [];
    arr.push(p.player_id);
    picksByUser.set(p.user_id, arr);
  }

  const users = new Set([...captainByUser.keys(), ...picksByUser.keys()]);
  const rows: ScoreRow[] = [];
  for (const user_id of users) {
    rows.push({
      user_id,
      category: "xi",
      ref_id: "xi",
      points: scoreTournamentXi(
        picksByUser.get(user_id) ?? [],
        captainByUser.get(user_id) ?? null,
        goldenSet,
      ),
      computed_at: now,
    });
  }
  await upsertScores(db, rows);
  return rows.length;
}

export interface RecomputeSummary {
  match: number;
  group: number;
  bracket: number;
  special: number;
  xi: number;
}

/**
 * Full, idempotent recompute of every score category. Safe to replay: every
 * write is an upsert keyed by (user_id, category, ref_id).
 */
export async function recomputeAll(
  db: Db = createAdminClient(),
): Promise<RecomputeSummary> {
  const now = new Date().toISOString();
  const [match, group, bracket, special, xi] = [
    await recomputeMatches(db, now),
    await recomputeGroups(db, now),
    await recomputeBracket(db, now),
    await recomputeSpecials(db, now),
    await recomputeXi(db, now),
  ];
  return { match, group, bracket, special, xi };
}
