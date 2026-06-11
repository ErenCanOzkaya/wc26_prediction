import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Motif26 } from "@/components/Motif26";
import { CareerLeaderboard } from "@/components/games/CareerLeaderboard";

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: todaySession }, { data: leagues }] = await Promise.all([
    supabase
      .from("game_session")
      .select("solved,points,finished_at")
      .eq("user_id", user!.id)
      .eq("mode", "daily")
      .eq("puzzle_date", today)
      .maybeSingle(),
    supabase.from("leagues").select("id,name"),
  ]);
  const played = todaySession?.finished_at != null;

  return (
    <div className="space-y-6">
      <h1 className="display rise text-6xl leading-[0.9] sm:text-7xl">
        THE
        <br />
        <span className="text-green">GAMES</span>
      </h1>

      <section className="grid gap-3 md:grid-cols-2">
        <Link
          href="/games/career?mode=daily"
          className="surface surface-hover rise group relative overflow-hidden p-6"
        >
          <Motif26 className="absolute -bottom-10 -right-6 scale-90 opacity-30 transition group-hover:opacity-60" />
          <h2 className="display text-3xl">Career Path</h2>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Guess the mystery player from their club career. Fewer guesses, more
            points.
          </p>
          <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-green">
            {played
              ? todaySession?.solved
                ? `Today: solved · +${todaySession.points} →`
                : "Today: played →"
              : "Play today's puzzle →"}
          </span>
        </Link>
        <Link
          href="/games/career?mode=practice"
          className="surface surface-hover rise flex flex-col justify-center p-6"
        >
          <h2 className="display text-2xl">Practice</h2>
          <p className="mt-2 text-sm text-muted">
            Endless random players. Doesn&apos;t count for the daily leaderboard.
          </p>
        </Link>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
          Leaderboard
        </h2>
        <CareerLeaderboard leagues={(leagues ?? []) as { id: string; name: string }[]} />
      </section>
    </div>
  );
}
