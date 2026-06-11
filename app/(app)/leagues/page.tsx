import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LeagueForms } from "@/components/LeagueForms";
import { TrophyIcon } from "@/components/TrophyIcon";

export const dynamic = "force-dynamic";

interface LeagueRow {
  id: string;
  name: string;
  invite_code: string;
  league_members: { count: number }[];
}

const ACCENTS = [
  "var(--color-green)",
  "var(--color-navy)",
  "var(--color-red)",
  "var(--color-sand)",
];

export default async function LeaguesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("leagues")
    .select("id,name,invite_code,league_members(count)")
    .order("created_at", { ascending: true });
  const leagues = (data ?? []) as unknown as LeagueRow[];

  return (
    <div>
      <h1 className="display rise text-6xl leading-[0.9] sm:text-7xl">
        YOUR
        <br />
        <span className="text-green">LEAGUES</span>
      </h1>
      <p className="mt-3 mb-6 max-w-md text-sm text-muted">
        Same predictions, every league. Create one or join with a code, then
        chase the top of the table.
      </p>

      <LeagueForms />

      <h2 className="mt-9 mb-3 text-xs font-bold uppercase tracking-[0.2em] text-muted">
        Your leagues
      </h2>
      {leagues.length === 0 ? (
        <div className="surface flex items-center gap-3 p-6 text-sm text-muted">
          <TrophyIcon className="h-6 w-6 text-muted" />
          You’re not in any league yet — create one or join with a code above.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((l, i) => {
            const accent = ACCENTS[i % ACCENTS.length];
            const count = l.league_members?.[0]?.count ?? 0;
            return (
              <Link
                key={l.id}
                href={`/leagues/${l.id}`}
                className="surface surface-hover relative overflow-hidden p-5"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: accent }}
                />
                <div className="flex items-start justify-between">
                  <h3 className="display text-2xl">{l.name}</h3>
                  <TrophyIcon className="h-5 w-5 text-muted" />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {count} member{count === 1 ? "" : "s"}
                </p>
                <p className="mt-3 text-xs text-muted">
                  Invite code{" "}
                  <span className="rounded-md bg-white/8 px-2 py-0.5 font-mono tracking-widest text-fg">
                    {l.invite_code}
                  </span>
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
