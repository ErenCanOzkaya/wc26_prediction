import { NextResponse } from "next/server";
import { pollOnce } from "@/lib/sync";

// The only place a poll is triggered. A scheduler (Vercel Cron / pg_cron /
// external cron) hits this on the cadences from API.md §4. Guarded by a shared
// secret so the public can't drive our rate budget.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const summary = await pollOnce();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// Vercel Cron uses GET; allow POST for manual / external triggers too.
export const GET = handle;
export const POST = handle;
