# Runbook

## Run it locally

### Fastest: demo mode (no Docker, no Supabase, no accounts)

```bash
pnpm install
pnpm --filter @khata/web dev:demo
```

Open http://localhost:3000 and sign in with **+919999900001** and code
**123456**. The dataset is seeded in your browser with two businesses and 60
days of entries; `localStorage.clear()` reseeds it.

Demo sign-ins:

| Phone | Person | Role |
|---|---|---|
| +919999900001 | Anil | Owner of Sharma Print Lab, staff at Green Leaf Tea Stall |
| +919999900002 | Priya | Owner of Green Leaf Tea Stall |
| +919999900003 | Ravi | Staff at Sharma Print Lab |
| anything else | new user | Lands in onboarding |

### Full stack: Postgres, Auth, Storage, Edge Functions

Needs Docker running.

```bash
pnpm install
supabase start                     # migrations + seed run automatically
cp .env.example apps/web/.env.local # fill in the keys supabase start printed
cp supabase/functions/.env.example supabase/.env
supabase functions serve --env-file supabase/.env --no-verify-jwt   # second terminal
pnpm dev                            # third terminal
```

`supabase start` prints `ANON_KEY` and `SERVICE_ROLE_KEY`; put the URL and anon
key into `apps/web/.env.local` and leave `NEXT_PUBLIC_DEMO_MODE=0`.

Sign in with the same test numbers and code `123456` — the local Auth container
is configured with those as test OTPs.

Useful addresses: Studio http://127.0.0.1:54323 · Mail http://127.0.0.1:54324 ·
API http://127.0.0.1:54321 · DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Tests

```bash
pnpm test                 # Vitest: parser, money, prediction, CSV, web utils
pnpm --filter @khata/parser test:coverage
supabase test db          # pgTAP: every RLS policy and totals invariant
cd supabase/functions && deno test -A   # webhook: signatures, idempotency, replies
pnpm test:e2e             # Playwright, demo mode, Pixel 7 + desktop
pnpm check:bundle         # home screen gzipped JS vs the 180 KB budget
pnpm check:parser-sync    # the edge-function parser mirror is current
```

Against the real stack (needs `supabase start` and `functions serve`):

```bash
cd apps/web && npx playwright test --config=playwright.supabase.config.ts
```

Record the demo videos from §14:

```bash
pnpm --filter @khata/web test:e2e:record   # test-results/**/video.webm
```

## Deploy

### Database

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy whatsapp-webhook whatsapp-send
supabase secrets set --env-file supabase/.env.production
```

Never set `MOCK_WHATSAPP=1` in production. `SUPABASE_SERVICE_ROLE_KEY` belongs
only in edge-function secrets — never in a `NEXT_PUBLIC_*` variable.

### Web

Vercel, root directory `apps/web`, build command `pnpm build`. Environment:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_DEMO_MODE=0`. Add the deployment URL to Supabase Auth's redirect
allow-list.

To publish a public demo instead, set `NEXT_PUBLIC_DEMO_MODE=1` and no other
variables; the build works with no backend at all.

### Repository secrets the workflows need

| Secret | Used by | What it is |
|---|---|---|
| `SUPABASE_URL` | keepalive | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | keepalive | Public anon key |
| `SUPABASE_DB_URL` | backup | Pooler connection string, includes the DB password |

## Operating the free tier

### Pausing

A free project pauses after **7 days** with no API activity, and a paused
project returns errors until someone resumes it in the dashboard.
`.github/workflows/keepalive.yml` calls `fn_ping` every 3 days.

This is a workaround, not a guarantee: GitHub disables scheduled workflows on
repositories with no activity for 60 days, and a scheduled run can be delayed
under load. Check the workflow is green monthly. The real fix, once there are
paying users, is the $25/month Pro plan — no code changes are needed for it.

### Backups — read this part

**There are no automatic backups on the free plan.**
`.github/workflows/backup.yml` runs `pg_dump` every Sunday at 02:00 UTC and
keeps the artifact for 90 days.

**Up to 7 days of data can be lost.** That is the honest exposure of a weekly
dump, and it is the single strongest argument for upgrading once real money is
being recorded.

### Restoring

1. Download the newest `khata-backup-*` artifact from the Actions tab and unzip it.
2. `gunzip backup/*.gz`
3. Point at the target project (a fresh one for a test restore):
   ```bash
   psql "$SUPABASE_DB_URL" -f backup/roles-<stamp>.sql
   psql "$SUPABASE_DB_URL" -f backup/schema-<stamp>.sql
   psql "$SUPABASE_DB_URL" -f backup/data-<stamp>.sql
   ```
4. `supabase functions deploy whatsapp-webhook whatsapp-send` and re-set secrets.
5. Sign in as a seeded owner and check today's totals against the last known
   figures before pointing the WhatsApp webhook at the restored project.

Practise a restore into a scratch project before you need one.

## Things that go wrong

| Symptom | Cause | Fix |
|---|---|---|
| Blank screen after sign-in, 406s in the console | A `.single()` query matching more than one row | Membership queries must filter by `user_id`; see `SupabaseRepo.getBootstrap` |
| WhatsApp entries never appear without a reload | `entries` missing from the `supabase_realtime` publication | Migration `20260901000400_realtime.sql` |
| `phone_provider_disabled` locally | GoTrue needs a declared SMS provider | The placeholder `[auth.sms.twilio]` block in `supabase/config.toml` |
| `Database error finding user` locally | Seeded `auth.users` rows with NULL token columns | Seed writes `''`, not NULL, for every token column |
| Webhook answers 503 on the first call | Edge runtime compiling on a cold start | Retry; it warms in a few seconds |
| Everything 401s in production | Project paused | Resume in the dashboard, then check the keepalive workflow |
| An expense saved twice | Two creates with different `client_id`s | The outbox mints one id per entry and reuses it on retry — do not regenerate it |
