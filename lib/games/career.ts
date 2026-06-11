"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreGame } from "./scoring";
import { comparePlayers, type Comparison } from "./compare";
import { pickDailyPlayer, dateSeed } from "./daily";
import { loadPlayerFacts } from "./facts";

export interface RevealedClub {
  club: string;
  clubLogoUrl: string | null;
  startYear: number | null;
  endYear: number | null;
  isLoan: boolean;
}

export interface GameView {
  sessionId: string;
  mode: "daily" | "practice";
  clubCount: number; // = guess limit (G)
  revealed: RevealedClub[]; // only revealed spells
  guesses: { playerId: number; name: string; comparison: Comparison }[];
  movesUsed: number;
  finished: boolean;
  solved: boolean;
  points: number;
  answer?: { name: string; nationality: string } | null; // only when finished
}

const todayIso = () => new Date().toISOString().slice(0, 10);

async function fullCareer(admin: ReturnType<typeof createAdminClient>, playerId: number) {
  const { data } = await admin
    .from("player_career")
    .select("ord,club,club_logo_url,start_year,end_year,is_loan")
    .eq("player_id", playerId)
    .order("ord", { ascending: true });
  return (data ?? []).map((r) => ({
    club: r.club as string,
    clubLogoUrl: (r.club_logo_url as string | null) ?? null,
    startYear: (r.start_year as number | null) ?? null,
    endYear: (r.end_year as number | null) ?? null,
    isLoan: (r.is_loan as boolean) ?? false,
  }));
}

/** Build the client-safe view from a session row (hides unrevealed clubs). */
async function buildView(
  admin: ReturnType<typeof createAdminClient>,
  session: {
    id: string;
    mode: "daily" | "practice";
    player_id: number;
    guessed_ids: number[];
    skips: number;
    finished_at: string | null;
    solved: boolean;
    points: number;
  },
): Promise<GameView> {
  const career = await fullCareer(admin, session.player_id);
  const clubCount = career.length;
  const movesUsed = session.guessed_ids.length + session.skips;
  const finished = session.finished_at != null;
  // Reveal 1 + one per move, capped at clubCount; reveal all when finished.
  const revealCount = finished ? clubCount : Math.min(clubCount, 1 + movesUsed);

  // Comparison chips for each guess.
  const guessIds = session.guessed_ids;
  const facts = await loadPlayerFacts(admin, [session.player_id, ...guessIds]);
  const answerFacts = facts.get(session.player_id)!;
  const { data: guessPlayers } = await admin
    .from("players")
    .select("id,name")
    .in("id", guessIds.length ? guessIds : [-1]);
  const nameById = new Map((guessPlayers ?? []).map((p) => [p.id as number, p.name as string]));
  const guesses = guessIds.map((id) => ({
    playerId: id,
    name: nameById.get(id) ?? "Player",
    comparison: comparePlayers(facts.get(id) ?? answerFacts, answerFacts),
  }));

  let answer: { name: string; nationality: string } | null = null;
  if (finished) {
    const { data: ans } = await admin
      .from("players")
      .select("name")
      .eq("id", session.player_id)
      .maybeSingle();
    answer = { name: (ans?.name as string) ?? "Player", nationality: answerFacts.nationality };
  }

  return {
    sessionId: session.id,
    mode: session.mode,
    clubCount,
    revealed: career.slice(0, revealCount),
    guesses,
    movesUsed,
    finished,
    solved: session.solved,
    points: session.points,
    answer,
  };
}

/** Start (or resume) a game. Daily is shared + once per user/day. */
export async function startCareerGame(
  mode: "daily" | "practice",
): Promise<GameView | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const admin = createAdminClient();

  if (mode === "daily") {
    const date = todayIso();
    // Ensure today's puzzle exists (idempotent).
    let { data: puzzle } = await admin
      .from("daily_puzzle")
      .select("player_id")
      .eq("date", date)
      .maybeSingle();
    if (!puzzle) {
      const { data: pool } = await admin
        .from("players")
        .select("id")
        .eq("career_game_eligible", true)
        .order("id", { ascending: true });
      const { data: recent } = await admin
        .from("daily_puzzle")
        .select("player_id")
        .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
      const chosen = pickDailyPlayer(
        dateSeed(date),
        (pool ?? []).map((p) => p.id as number),
        (recent ?? []).map((r) => r.player_id as number),
      );
      await admin.from("daily_puzzle").upsert({ date, player_id: chosen }, { onConflict: "date" });
      ({ data: puzzle } = await admin
        .from("daily_puzzle")
        .select("player_id")
        .eq("date", date)
        .maybeSingle());
    }

    // Resume or create the user's session for today.
    let { data: session } = await admin
      .from("game_session")
      .select("*")
      .eq("user_id", user.id)
      .eq("mode", "daily")
      .eq("puzzle_date", date)
      .maybeSingle();
    if (!session) {
      const { data: created } = await admin
        .from("game_session")
        .insert({
          user_id: user.id,
          player_id: puzzle!.player_id,
          mode: "daily",
          puzzle_date: date,
        })
        .select("*")
        .single();
      session = created;
    }
    return buildView(admin, session as never);
  }

  // Practice: random eligible answer, new session each time.
  const { data: pool } = await admin
    .from("players")
    .select("id")
    .eq("career_game_eligible", true);
  if (!pool?.length) return { error: "No players available" };
  const answerId = pool[Math.floor(Math.random() * pool.length)].id as number;
  const { data: created } = await admin
    .from("game_session")
    .insert({ user_id: user.id, player_id: answerId, mode: "practice" })
    .select("*")
    .single();
  return buildView(admin, created as never);
}

async function loadOwnedSession(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  const admin = createAdminClient();
  const { data: session } = await admin
    .from("game_session")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== user.id) return { error: "Not found" as const };
  return { admin, session };
}

/** Submit a guess; reveals the next club and scores on a correct/last guess. */
export async function submitGuess(
  sessionId: string,
  guessId: number,
): Promise<GameView | { error: string }> {
  const ctx = await loadOwnedSession(sessionId);
  if ("error" in ctx) return { error: ctx.error! };
  const { admin, session } = ctx;
  if (session.finished_at) return buildView(admin, session as never);
  if ((session.guessed_ids as number[]).includes(guessId))
    return buildView(admin, session as never); // ignore duplicate

  const career = await fullCareer(admin, session.player_id);
  const clubCount = career.length;
  const guessed = [...(session.guessed_ids as number[]), guessId];
  const movesUsed = guessed.length + session.skips;
  const correct = guessId === session.player_id;
  const outOfMoves = movesUsed >= clubCount;
  const finished = correct || outOfMoves;

  const update: Record<string, unknown> = { guessed_ids: guessed };
  if (finished) {
    update.finished_at = new Date().toISOString();
    update.solved = correct;
    update.points = scoreGame(clubCount, movesUsed, correct);
  }
  const { data: updated } = await admin
    .from("game_session")
    .update(update)
    .eq("id", sessionId)
    .select("*")
    .single();
  return buildView(admin, updated as never);
}

/** Skip: reveal the next club without guessing (consumes a move). */
export async function skipReveal(
  sessionId: string,
): Promise<GameView | { error: string }> {
  const ctx = await loadOwnedSession(sessionId);
  if ("error" in ctx) return { error: ctx.error! };
  const { admin, session } = ctx;
  if (session.finished_at) return buildView(admin, session as never);

  const career = await fullCareer(admin, session.player_id);
  const skips = session.skips + 1;
  const movesUsed = (session.guessed_ids as number[]).length + skips;
  const update: Record<string, unknown> = { skips };
  if (movesUsed >= career.length) {
    update.finished_at = new Date().toISOString();
    update.solved = false;
    update.points = 0;
  }
  const { data: updated } = await admin
    .from("game_session")
    .update(update)
    .eq("id", sessionId)
    .select("*")
    .single();
  return buildView(admin, updated as never);
}

/** Leaderboard via the SECURITY DEFINER RPC (never exposes the answer). */
export async function getLeaderboard(
  scope: string, // 'global' or a league id
  period: "daily" | "all",
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("career_leaderboard", {
    p_scope: scope,
    p_period: period,
    p_date: todayIso(),
  });
  if (error) return { error: error.message };
  return { rows: data ?? [] };
}
