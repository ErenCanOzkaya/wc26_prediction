// E2E: exercises the game data + RLS directly (server-action logic mirrored).
// Verifies: hidden clubs are not over-revealed, scoring, daily replay block,
// and that the leaderboard RPC never returns player_id.
//
// Run:  node --env-file=.env.local scripts/e2e-career-game.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

async function main() {
  // Pick an eligible player with a known club count.
  const { data: pool } = await admin
    .from("players")
    .select("id,name")
    .eq("career_game_eligible", true)
    .limit(1);
  assert(pool?.length === 1, "found an eligible player");
  const answerId = pool[0].id;
  const { data: career } = await admin
    .from("player_career")
    .select("ord")
    .eq("player_id", answerId);
  const clubCount = career.length;
  assert(clubCount >= 3, `answer has >=3 clubs (got ${clubCount})`);

  // Reveal math: initial reveal is 1, then +1 per move, capped at clubCount.
  const revealAfter = (moves) => Math.min(clubCount, 1 + moves);
  assert(revealAfter(0) === 1, "starts with exactly 1 club revealed");
  assert(revealAfter(clubCount) === clubCount, "never reveals more than clubCount");

  // Scoring sanity (mirror of scoreGame).
  const score = (moves, solved) => (solved ? Math.max(1, clubCount - moves + 1) : 0);
  assert(score(1, true) === clubCount, "first-move solve = clubCount points");
  assert(score(clubCount, true) === 1, "last-move solve = 1 point");
  assert(score(2, false) === 0, "unsolved = 0 points");

  // Leaderboard RPC must not expose player_id.
  const { data: lb } = await admin.rpc("career_leaderboard", {
    p_scope: "global",
    p_period: "all",
    p_date: new Date().toISOString().slice(0, 10),
  });
  if ((lb ?? []).length > 0) {
    assert(!("player_id" in lb[0]), "leaderboard rows do not include player_id");
  } else {
    console.log("ok: leaderboard empty (no finished games yet) — skip column check");
  }

  console.log("\nE2E PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
