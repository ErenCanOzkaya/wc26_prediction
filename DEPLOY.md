# Deploy — wc26-league

## 1. Push to GitHub

The repo is already git-initialised. Create an empty GitHub repo, then:

```bash
git remote add origin git@github.com:<you>/wc26-league.git
git push -u origin main
```

## 2. Import to Vercel

- vercel.com → **Add New… → Project** → import the repo. Framework = Next.js (auto).
- **Environment Variables** (Settings → Environment Variables) — copy from your
  `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `FOOTBALL_DATA_API_KEY`
  - `FOOTBALL_DATA_BASE` = `https://api.football-data.org/v4`
  - `WC_COMPETITION_CODE` = `WC`, `WC_COMPETITION_ID` = `2000`
  - `CRON_SECRET` = a random string (REQUIRED in prod — guards the poller)
- Deploy. Note your domain, e.g. `https://wc26.vercel.app`.

## 3. Supabase auth redirect

Supabase → Authentication → URL Configuration:
- **Site URL** = your Vercel domain.
- Add `https://<domain>/auth/callback` to **Redirect URLs**.

## 4. Seed the data once

After the first deploy, trigger one poll to populate teams/fixtures/standings:

```bash
curl -H "authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/poll
```

(Expect `{"ok":true,"teamsSynced":48,...}`.)

## 5. Keep scores live (the poller schedule)

`vercel.json` registers a **daily** baseline poll. Vercel Cron on **Hobby** only
fires ~once a day; **Pro** can run every minute. Vercel automatically adds
`Authorization: Bearer $CRON_SECRET` to its cron requests, so the guard passes.

For **live scores during matches**, poll every ~1 minute. Easiest free option —
an external cron such as **cron-job.org**:

- URL: `https://<domain>/api/cron/poll`
- Method: GET
- Header: `Authorization: Bearer <your CRON_SECRET>`
- Schedule: every 1 minute (or every 30s if your provider allows).

Each poll makes ~3 calls to football-data (limit 10/min) and recomputes scores
on any finish. The app's pages auto-refresh every 45s while a match is `live`, so
scores tick up on the calendar / predictions / match pages without a manual
reload. (Free tier provides score + status, not minute-by-minute events.)

Alternative scheduler: Supabase **pg_cron + pg_net** calling the same endpoint.

## 6. Tournament-end admin steps

Set the manually-resolved awards in `tournament_results` (Best Player, Best Young
Player, the Golden XI) and re-run `/api/cron/recompute` to score them.
