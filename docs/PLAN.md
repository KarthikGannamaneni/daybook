# Implementation plan — Daybook

Source of truth for product, P0/P1, stack, UI, and tests: **[AGENT_PROMPT.md](./AGENT_PROMPT.md)**. This file is only the build sequence.

Written before coding, updated at the end (see "What changed" at the bottom).

## Order of work

1. **Repo skeleton.** pnpm workspaces, strict TS, ESLint/Prettier, CI, env example.
2. **`packages/parser`.** Pure TypeScript, zero dependencies, the WhatsApp grammar from
   §4.5 plus adversarial handling. Built first because it is the only piece with a hard
   100% branch-coverage target and both the edge function and the app import it.
3. **`packages/shared`.** `Money` (integer minor units on `bigint`), locale formatting,
   Zod schemas, category-prediction ranking as a pure function, database types.
4. **Database.** Versioned migrations: tables → triggers → views → functions → RLS.
   Seed with two demo businesses and 60 days of entries. pgTAP tests per policy.
5. **Edge functions.** `whatsapp-webhook` (signature check, idempotency, parse, insert,
   exactly one reply) and `whatsapp-send` (Meta call, or mock log when `MOCK_WHATSAPP=1`).
   Deno tests alongside.
6. **Web app.** Composer home → month → search → party → settings → onboarding → auth.
   Offline queue + service worker last, because it wraps the mutation layer.
7. **Tests.** Vitest as each package lands; Playwright once the routes exist.
8. **Docs and workflows.** RUNBOOK, WHATSAPP_SETUP, MANUAL_TEST, DECISIONS; ci/keepalive/backup.

## Architecture decisions taken up front

- **A repository seam between UI and Supabase.** Every read and write in the app goes
  through `lib/data/repo.ts`, which resolves to either the Supabase client or a local
  demo store. This is what makes the app runnable and e2e-testable with no Docker, and it
  costs one interface. Totals still come from the server in Supabase mode (§9).
- **Money never touches `number`.** `Money` wraps `bigint` minor units. Parsing user text
  ("1,20,000", "1.5k") and formatting (`Intl.NumberFormat`) are the only boundaries.
- **Parsing is deterministic and shared.** One grammar, one test table, imported by both
  runtimes. No LLM anywhere on the money path (§13).
- **RLS is the only authorisation.** The UI hides what a role cannot do; the database
  refuses it. pgTAP proves the refusal.

## Risks

- Supabase free tier pauses after 7 days idle → keepalive workflow (§2).
- No managed backups → weekly `pg_dump` workflow, 7-day worst-case data loss, stated in RUNBOOK.
- Parser will miss phrasings → every inbound message and its parse result is logged so the
  fix is a new rule with a new test row, not a model call.

## What changed during the build

- Added **demo mode** as a first-class run target. The build environment had no Docker
  daemon and no Supabase CLI, so "runs locally" needed a path that does not depend on
  either. It is also what the Playwright suite runs against in CI. Recorded in DECISIONS.md.
- Category prediction ships as both a SQL function (`fn_predict_category`) and the pure
  TS ranking function it mirrors, so the ranking is unit-testable per §10.1.
- The `undo` window for WhatsApp is enforced in the webhook rather than by a scheduled job.
