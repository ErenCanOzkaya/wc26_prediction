// One-off: for the career-game pool, clean youth/reserve spells and attach club
// logos + leagues from Wikidata (CC0). Recomputes career_game_eligible.
//
// Run:  node --env-file=.env.local scripts/ingest-club-meta.mjs

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

// Name heuristic for reserve/youth sides.
const YOUTH = /\b(C|B|II|U1[89]|U2[0-3]|Juvenil|Atlètic|Atletic|Reserve|Reserves|Youth|Academy)\b/;

// All career rows, grouped by club name (one Wikidata lookup per distinct club).
async function allCareerRows() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("player_career")
      .select("player_id,ord,club")
      .order("player_id")
      .range(from, from + 999);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

// Wikidata: for a club label, return { logo, league }.
async function clubMeta(club) {
  const q = `SELECT ?logo ?leagueLabel ?p31 WHERE {
    ?c rdfs:label "${club.replace(/"/g, '\\"')}"@en .
    OPTIONAL { ?c wdt:P154 ?logo }
    OPTIONAL { ?c wdt:P118 ?league }
    OPTIONAL { ?c wdt:P31 ?p31 }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
  } LIMIT 10`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  let res;
  try {
    res = await fetch(
      `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`,
      {
        headers: {
          Accept: "application/sparql-results+json",
          "User-Agent": "wc26-league/1.0 (club meta ingest)",
        },
        signal: ac.signal,
      },
    );
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) throw new Error(`wd ${res.status}`);
  const rows = (await res.json()).results.bindings;
  if (!rows.length) return { logo: null, league: null };
  const logoFile = rows.find((r) => r.logo)?.logo?.value ?? null;
  const league = rows.find((r) => r.leagueLabel)?.leagueLabel?.value ?? null;
  return { logo: logoFile, league };
}

async function main() {
  const rows = await allCareerRows();
  const clubs = [...new Set(rows.map((r) => r.club))];
  console.log(`career rows: ${rows.length}, distinct clubs: ${clubs.length}`);

  // Look up each distinct club once.
  const meta = new Map();
  let done = 0;
  const POOL = 5;
  let idx = 0;
  const worker = async () => {
    while (idx < clubs.length) {
      const club = clubs[idx++];
      try {
        meta.set(club, await clubMeta(club));
      } catch {
        meta.set(club, { logo: null, league: null });
      }
      if (++done % 25 === 0) {
        writeFileSync("/tmp/clubmeta-progress.txt", `${done}/${clubs.length}\n`);
      }
    }
  };
  await Promise.all(Array.from({ length: POOL }, worker));

  // Drop youth/reserve spells; update the rest with logo + league.
  const keep = rows.filter((r) => !YOUTH.test(r.club));
  const dropped = rows.length - keep.length;

  // Re-number ord per player after dropping, and attach meta.
  const byPlayer = new Map();
  for (const r of keep) {
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, []);
    byPlayer.get(r.player_id).push(r);
  }
  await db.from("player_career").delete().neq("player_id", -1);
  const newRows = [];
  const eligible = [];
  for (const [pid, list] of byPlayer) {
    list.sort((a, b) => a.ord - b.ord);
    list.forEach((r, ord) => {
      const m = meta.get(r.club) ?? { logo: null, league: null };
      newRows.push({
        player_id: pid,
        ord,
        club: r.club,
        club_logo_url: m.logo,
        league: m.league,
      });
    });
    if (list.length >= 3) eligible.push(pid);
  }
  for (let i = 0; i < newRows.length; i += 500) {
    const { error } = await db.from("player_career").insert(newRows.slice(i, i + 500));
    if (error) {
      console.error("insert error:", error.message);
      break;
    }
  }
  await db.from("players").update({ career_game_eligible: false }).neq("id", -1);
  for (let i = 0; i < eligible.length; i += 200) {
    await db
      .from("players")
      .update({ career_game_eligible: true })
      .in("id", eligible.slice(i, i + 200));
  }
  console.log(
    `dropped youth/reserve: ${dropped}, kept rows: ${newRows.length}, eligible: ${eligible.length}`,
  );
  console.log("written ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
