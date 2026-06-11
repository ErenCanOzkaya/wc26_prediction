"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
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

async function fullCareer(db: SupabaseClient, playerId: number) {
  const { data } = await db
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

/**
 * Build the client-safe view from a session row (hides unrevealed clubs).
 * `career` is passed in (fetched once by the caller) and the lookups run in
 * parallel to keep each guess/skip snappy.
 */
async function buildView(
  db: SupabaseClient,
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
  career: Awaited<ReturnType<typeof fullCareer>>,
): Promise<GameView> {
  const clubCount = career.length;
  const movesUsed = session.guessed_ids.length + session.skips;
  const finished = session.finished_at != null;
  // Reveal 1 + one per move, capped at clubCount; reveal all when finished.
  const revealCount = finished ? clubCount : Math.min(clubCount, 1 + movesUsed);

  // Facts (for chips) + names for the answer and every guess, in parallel.
  const guessIds = session.guessed_ids;
  const ids = [session.player_id, ...guessIds];
  const [facts, namesRes] = await Promise.all([
    loadPlayerFacts(db, ids),
    db.from("players").select("id,name").in("id", ids),
  ]);
  const answerFacts = facts.get(session.player_id)!;
  const nameById = new Map(
    (namesRes.data ?? []).map((p) => [p.id as number, p.name as string]),
  );
  const guesses = guessIds.map((id) => ({
    playerId: id,
    name: nameById.get(id) ?? "Player",
    comparison: comparePlayers(facts.get(id) ?? answerFacts, answerFacts),
  }));

  const answer = finished
    ? {
        name: nameById.get(session.player_id) ?? "Player",
        nationality: answerFacts.nationality,
      }
    : null;

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
    const career = await fullCareer(admin, (session as { player_id: number }).player_id);
    return buildView(admin, session as never, career);
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
  const career = await fullCareer(admin, answerId);
  return buildView(admin, created as never, career);
}

// Session row shape used by the guess/skip path.
type SessionRow = {
  id: string;
  mode: "daily" | "practice";
  player_id: number;
  guessed_ids: number[];
  skips: number;
  finished_at: string | null;
  solved: boolean;
  points: number;
};

/**
 * Read the caller's own session via the user-scoped client. RLS guarantees only
 * the owner can select/update it, so no separate auth round-trip is needed.
 */
async function ownSession(supabase: SupabaseClient, sessionId: string) {
  const { data } = await supabase
    .from("game_session")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  return data as SessionRow | null;
}

/** Submit a guess; reveals the next club and scores on a correct/last guess. */
export async function submitGuess(
  sessionId: string,
  guessId: number,
): Promise<GameView | { error: string }> {
  const supabase = await createClient();
  const session = await ownSession(supabase, sessionId);
  if (!session) return { error: "Not found" };
  const career = await fullCareer(supabase, session.player_id);
  if (session.finished_at) return buildView(supabase, session, career);
  if (session.guessed_ids.includes(guessId))
    return buildView(supabase, session, career); // ignore duplicate

  const clubCount = career.length;
  const guessed = [...session.guessed_ids, guessId];
  const movesUsed = guessed.length + session.skips;
  const correct = guessId === session.player_id;
  const finished = correct || movesUsed >= clubCount;

  const update: Record<string, unknown> = { guessed_ids: guessed };
  if (finished) {
    update.finished_at = new Date().toISOString();
    update.solved = correct;
    update.points = scoreGame(clubCount, movesUsed, correct);
  }
  const { data: updated } = await supabase
    .from("game_session")
    .update(update)
    .eq("id", sessionId)
    .select("*")
    .single();
  return buildView(supabase, updated as SessionRow, career);
}

/** Skip: reveal the next club without guessing (consumes a move). */
export async function skipReveal(
  sessionId: string,
): Promise<GameView | { error: string }> {
  const supabase = await createClient();
  const session = await ownSession(supabase, sessionId);
  if (!session) return { error: "Not found" };
  const career = await fullCareer(supabase, session.player_id);
  if (session.finished_at) return buildView(supabase, session, career);

  const skips = session.skips + 1;
  const movesUsed = session.guessed_ids.length + skips;
  const update: Record<string, unknown> = { skips };
  if (movesUsed >= career.length) {
    update.finished_at = new Date().toISOString();
    update.solved = false;
    update.points = 0;
  }
  const { data: updated } = await supabase
    .from("game_session")
    .update(update)
    .eq("id", sessionId)
    .select("*")
    .single();
  return buildView(supabase, updated as SessionRow, career);
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
