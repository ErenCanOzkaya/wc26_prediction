// One-off: draft each WC player's club career into `player_career` from Wikidata
// (CC0). Match by exact date of birth (a strong disambiguator) + footballer
// occupation, exclude national teams, order spells chronologically.
//
// Run:  node --env-file=.env.local scripts/ingest-careers.mjs
//
// Then curate: youth/reserve spells still come through — trim them and set
// players.career_game_eligible by hand for the pool you want in the game.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env. Run with: node --env-file=.env.local scripts/ingest-careers.mjs");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const fold = (s) =>
  s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function allPlayers() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("players")
      .select("id,name,date_of_birth")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function wikidataCareer(name, dob) {
  // Exact dob literal is index-backed (fast); the YEAR()/MONTH()/DAY() filter
  // was a full scan and timed out.
  const q = `SELECT ?p ?pLabel ?clubLabel ?start ?end WHERE {
    ?p wdt:P569 "${dob}T00:00:00Z"^^xsd:dateTime ; wdt:P106 wd:Q937857 .
    ?p p:P54 ?st . ?st ps:P54 ?club .
    MINUS { ?club wdt:P31/wdt:P279* wd:Q6979593 }
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es,fr,de,pt,tr,it,nl,ar" }
  }`;
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`;
  const opts = {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": "wc26-league/1.0 (career-path game; one-off ingest)",
    },
  };
  // Per-request timeout + one retry so a slow/hung request can't stall the run.
  const fetchOnce = async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12000);
    try {
      return await fetch(url, { ...opts, signal: ac.signal });
    } finally {
      clearTimeout(t);
    }
  };
  let res;
  try {
    res = await fetchOnce();
  } catch {
    await sleep(1500);
    res = await fetchOnce();
  }
  if (!res.ok) throw new Error(`wd ${res.status}`);
  const rows = (await res.json()).results.bindings;

  // Group rows by person.
  const byPerson = new Map();
  for (const r of rows) {
    const pid = r.p.value;
    if (!byPerson.has(pid))
      byPerson.set(pid, { label: r.pLabel?.value ?? "", rows: [] });
    byPerson.get(pid).rows.push(r);
  }
  if (byPerson.size === 0) return null;

  // Choose the person whose name matches; dob already makes this near-unique.
  const fn = fold(name);
  const lastName = fn.split(/\s+/).pop();
  const people = [...byPerson.values()];
  const chosen =
    people.find((p) => fold(p.label) === fn) ??
    (people.length === 1 ? people[0] : null) ??
    people.find((p) => fold(p.label).split(/\s+/).pop() === lastName);
  if (!chosen) return null;

  // Distinct club spells, ordered chronologically.
  const seen = new Set();
  const spells = [];
  for (const r of chosen.rows) {
    const club = r.clubLabel?.value;
    if (!club) continue;
    const start = r.start ? Number(r.start.value.slice(0, 4)) : null;
    const end = r.end ? Number(r.end.value.slice(0, 4)) : null;
    const k = `${club}|${start}`;
    if (seen.has(k)) continue;
    seen.add(k);
    spells.push({ club, start, end });
  }
  spells.sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999));
  return spells;
}

async function main() {
  const players = await allPlayers();
  console.log(`players: ${players.length}`);

  const careerRows = [];
  const eligible = [];
  let resolved = 0,
    unresolved = 0,
    errors = 0,
    done = 0;

  async function processPlayer(p) {
    if (!p.date_of_birth) {
      unresolved++;
    } else {
      try {
        const spells = await wikidataCareer(p.name, p.date_of_birth);
        if (!spells || spells.length === 0) {
          unresolved++;
        } else {
          resolved++;
          spells.forEach((s, ord) =>
            careerRows.push({
              player_id: p.id,
              ord,
              club: s.club,
              start_year: s.start,
              end_year: s.end,
            }),
          );
          if (new Set(spells.map((s) => s.club)).size >= 3) eligible.push(p.id);
        }
      } catch {
        errors++;
      }
    }
    done++;
    if (done % 25 === 0) {
      const line = `${done}/${players.length} | resolved ${resolved} | unresolved ${unresolved} | err ${errors}`;
      console.log("…" + line);
      // Synchronous write so progress is visible live (stdout to a file buffers).
      try {
        writeFileSync("/tmp/ingest-progress.txt", line + "\n");
      } catch {}
    }
  }

  // Concurrency pool — Wikidata handles a few parallel requests fine for a one-off.
  const POOL = 5;
  let idx = 0;
  const worker = async () => {
    while (idx < players.length) await processPlayer(players[idx++]);
  };
  await Promise.all(Array.from({ length: POOL }, worker));

  console.log(
    `\nDONE fetch: resolved ${resolved}, unresolved ${unresolved}, errors ${errors}`,
  );
  console.log(`career rows: ${careerRows.length}, eligible (≥3 clubs): ${eligible.length}`);

  // Write: clear then insert in chunks.
  await db.from("player_career").delete().neq("player_id", -1);
  for (let i = 0; i < careerRows.length; i += 500) {
    const { error } = await db.from("player_career").insert(careerRows.slice(i, i + 500));
    if (error) {
      console.error("insert error:", error.message);
      break;
    }
  }
  // Reset + set eligibility.
  await db.from("players").update({ career_game_eligible: false }).neq("id", -1);
  for (let i = 0; i < eligible.length; i += 200) {
    await db
      .from("players")
      .update({ career_game_eligible: true })
      .in("id", eligible.slice(i, i + 200));
  }
  console.log("written to DB ✓");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
