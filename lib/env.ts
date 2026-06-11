// Centralized, typed environment access.
//
// Accessors are functions (not top-level constants) so that a missing variable
// throws at *request time* with a clear message, instead of breaking the build
// before Supabase / the data provider have been configured.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local (see .env.local.example).`,
    );
  }
  return value;
}

/** Values safe to expose to the browser (inlined by Next at build time). */
export function publicEnv() {
  return {
    supabaseUrl: required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabaseAnonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/** Server-only secrets. Never import this from a Client Component. */
export function serverEnv() {
  return {
    supabaseUrl: required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    supabaseServiceRoleKey: required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    footballApiKey: required(
      "FOOTBALL_DATA_API_KEY",
      process.env.FOOTBALL_DATA_API_KEY,
    ),
    // Confirmed via /v4/competitions: FIFA World Cup = code "WC", id 2000,
    // season 2026-06-11 .. 2026-07-19 (TIER_ONE, available on the free tier).
    footballBase:
      process.env.FOOTBALL_DATA_BASE ?? "https://api.football-data.org/v4",
    wcCompetitionCode: process.env.WC_COMPETITION_CODE ?? "WC",
    wcCompetitionId: Number(process.env.WC_COMPETITION_ID ?? "2000"),
  };
}
