# Khata

A daily cash ledger for a small business. Record an expense in three taps, or by
sending `450 tea shop` on WhatsApp.

Single-entry cashbook, mobile-first installable PWA, INR/en-IN by default and
configurable per business. Not accounting software, deliberately.

```bash
pnpm install
pnpm dev:demo     # http://localhost:3000 — no Docker, no accounts, seeded data
```

Sign in with **+919999900001** and code **123456**.

## What is here

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 app: composer, month, search, party, settings, PWA |
| `packages/parser` | The WhatsApp grammar. Pure TS, zero dependencies, 118 tests |
| `packages/shared` | `Money` on bigint, Zod schemas, category prediction, CSV |
| `supabase/migrations` | Schema, views, functions, RLS — the authorisation model |
| `supabase/functions` | `whatsapp-webhook` and `whatsapp-send` edge functions |
| `supabase/tests` | pgTAP proofs for every policy |
| `docs/` | PLAN, DECISIONS, RUNBOOK, WHATSAPP_SETUP, MANUAL_TEST, P0_ACCEPTANCE |

## Two ways to run it

**Demo mode** (`NEXT_PUBLIC_DEMO_MODE=1`) runs the whole product against a
deterministic browser-local dataset. No Docker, no Supabase project, no Meta
app. This is what `pnpm dev:demo` and the Playwright suite use.

**Supabase mode** runs against Postgres with row-level security, real auth,
storage and edge functions. `supabase start` applies the migrations and seed.

Both go through one `LedgerRepo` interface, so the UI is identical. See
[docs/DECISIONS.md](docs/DECISIONS.md) for why, and
[docs/RUNBOOK.md](docs/RUNBOOK.md) for the commands.

## Tests

```bash
pnpm test               # Vitest: parser, money, prediction, CSV, utils
supabase test db        # pgTAP: every RLS policy
cd supabase/functions && deno test -A   # webhook: signatures, idempotency, replies
pnpm test:e2e           # Playwright: Pixel 7 + desktop, 90 scenarios
pnpm check:bundle       # home screen gzipped JS vs the 180 KB budget
```

## Money

Amounts are integer minor units on `bigint`, everywhere. `Intl.NumberFormat` is
the only place a JavaScript `number` touches money, at the last step before
pixels. Totals are computed in Postgres, never summed on the client.
