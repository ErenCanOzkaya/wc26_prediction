import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { startCareerGame } from "@/lib/games/career";
import { CareerGame } from "@/components/games/CareerGame";
import type { SearchPlayer } from "@/components/games/PlayerSearch";

export const dynamic = "force-dynamic";

export default async function CareerGamePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const gameMode = mode === "practice" ? "practice" : "daily";

  const view = await startCareerGame(gameMode);
  if ("error" in view) {
    return (
      <div className="mx-auto max-w-md text-center">
        <p className="text-sm text-muted">{view.error}</p>
        <Link href="/games" className="mt-3 inline-block text-green">
          ← Games
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  // Guessable universe = all WC players (paginate past the 1000-row cap).
  const players: SearchPlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("players")
      .select("id,name")
      .order("name")
      .range(from, from + 999);
    if (!data?.length) break;
    players.push(...(data as SearchPlayer[]));
    if (data.length < 1000) break;
  }
  // Country name -> national-team crest, for the nationality chip flag.
  const { data: teams } = await supabase.from("teams").select("name,crest_url");
  const crests: Record<string, string> = {};
  for (const t of teams ?? [])
    if (t.crest_url) crests[t.name as string] = t.crest_url as string;

  return (
    <div>
      <Link href="/games" className="text-sm text-muted hover:text-fg">
        ← Games
      </Link>
      <div className="mt-3">
        <CareerGame initial={view} players={players} crests={crests} />
      </div>
    </div>
  );
}
