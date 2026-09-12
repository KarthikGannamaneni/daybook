# P0 acceptance report

Every line of the §11 checklist, with what was actually run and what it showed.
Where something does not pass, it says so.

Evidence was gathered on macOS with Node 24, Docker running, the Supabase local
stack up, and the edge functions served locally.

---

## §11 checklist

### ☑ `pnpm dev` starts the app against `supabase start` with seed data, documented in RUNBOOK

**Pass.** `supabase start` applies all five migrations and `seed.sql`
automatically; verified from a clean stack. Both paths are in
[RUNBOOK.md](RUNBOOK.md): `pnpm dev:demo` (nothing required) and `supabase start`
+ `pnpm dev` (full backend).

```
Applying migration 20260901000000_init.sql...
Applying migration 20260901000100_functions_views.sql...
Applying migration 20260901000200_rls.sql...
Applying migration 20260901000300_storage.sql...
Applying migration 20260901000400_realtime.sql...
Seeding data from supabase/seed.sql...
```

### ☑ All tests in §10.1–10.4 pass

**Pass**, green in CI on a clean GitHub runner as well as locally — all four
jobs: unit, pgTAP, edge functions, and e2e + bundle budget.
Runs: <https://github.com/KarthikGannamaneni/daybook/actions>

CI earned its keep immediately: it caught an offline test that passed locally
only because link prefetch had won a race, and a queue test that typed into the
composer while it was still clearing. Both are fixed rather than retried.

| Suite | Command | Result |
|---|---|---|
| §10.1 parser | `pnpm --filter @khata/parser test` | **118 passed** — 96 grammar rows + 22 helper tests |
| §10.1 money / prediction / CSV | `pnpm --filter @khata/shared test` | **45 passed** |
| §10.1 web utils | `pnpm --filter @khata/web test` | **12 passed** |
| §10.2 database | `supabase test db` | **35 passed** across 2 pgTAP files |
| §10.3 edge functions | `deno test -A` | **14 passed** |
| §10.4 end to end | `pnpm test:e2e` | **90 passed** (Pixel 7 + desktop) |

Parser coverage: 100% statements / 100% functions / **92.6% branches**. The
prompt targets 100% branches; the shortfall is entirely defensive `?? ''`
fallbacks that `noUncheckedIndexedAccess` requires and no input reaches. The
threshold is pinned in `vitest.config.ts`.

### ☑ First visit to first saved entry in under 60 seconds

**Pass.** `e2e/onboarding.spec.ts` drives sign-in → three onboarding steps →
composer and asserts the scripted interaction completes in under 30 seconds; it
also asserts the amount field is focused with `inputmode="decimal"` on arrival.

### ☑ A repeat expense takes 3 taps or fewer from app open

**Pass.** `e2e/entries.spec.ts` — open app (tap 1) → quick chip (tap 2) → Save
(tap 3), asserting the entry lands, the total moves and the composer resets.

### ☑ `450 tea shop` from a linked number creates an entry and gets exactly one reply

**Pass**, verified against the live local stack, not only mocks. Posting a
Meta-shaped signed payload produced:

```
 direction |  phone_e164   |                       body                        | has_entry
-----------+---------------+---------------------------------------------------+-----------
 in        | +919999900001 | 450 tea shop                                      | t
 out       | +919999900001 | Saved: ₹450 expense, Food & Tea, Cash. Today's …  | f
```

One inbound row, one outbound row, one entry (₹450, Food & Tea, Cash). Re-posting
the same `wa_message_id` added **no** second entry and **no** second reply. An
unlinked number got exactly one "not linked" reply and no entry; junk got one
help reply; `today` returned a three-line summary.

### ☑ Staff cannot read another business's data, and cannot delete owner entries

**Pass.** pgTAP proves the database refuses it — a member of business A reads 0
rows of B across `entries`, `accounts`, `categories`, `parties`,
`business_members`, `user_settings` and `v_entries`, and writes into B raise
`42501`. Staff cannot hard-delete or soft-delete an owner's entry (0 rows
affected), cannot edit their own entry older than 7 days, and cannot attribute an
entry to another user. The e2e suite shows the same refusal surfacing in the UI.

### ☑ The app works offline for viewing and queued creation

**Pass.** `e2e/offline.spec.ts` goes offline, saves two entries, asserts the
"2 entries waiting to sync" pill, comes back online, and asserts both synced
**once each** and the pill cleared. A reload does not replay the queue. Two more
tests read a previously-visited month view with the network off, and confirm the
current screen keeps working and accepting entries after the connection drops.

**Bounded, and the bound is documented:** switching tabs offline works for
routes already loaded, but Next's client router cache expires after ~30 seconds
and an expired route needs the network. The service worker falls back to the
cached shell so a reload still boots the app. See DECISIONS §18.

### ◐ CSV export opens correctly in Excel and Google Sheets

**Partially verified.** Structure is asserted programmatically: UTF-8 BOM (so
Excel reads Devanagari and Telugu notes), CRLF line endings, RFC 4180 quoting of
commas/quotes/newlines, ISO 8601 plus a localised date column, and both a machine
amount (`123456.00`) and a lakh-formatted display amount (`₹1,23,456.00`). The
e2e suite downloads the file and checks its contents.

**Not done: nobody opened it in Excel or Google Sheets.** That is a manual step
in [MANUAL_TEST.md](MANUAL_TEST.md) and it has not been performed.

### ◐ Lighthouse and bundle budgets

**Bundle: pass.** 152.8 KB gzipped for the home screen against a 180 KB budget,
enforced by `pnpm check:bundle` in CI. Achieved by loading the data layer,
the bottom sheets and the animation library on demand — see DECISIONS §10.

**Lighthouse: performance passes, the LCP sub-target is not cleanly met.**

| Run | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| Mobile, `/` | **95** | 100 | 100 | 100 |
| Desktop, `/sign-in` | **99** | 100 | 100 | 100 |

Mobile: FCP 0.8 s, CLS 0, TBT 130 ms, **LCP 2.8 s**. That LCP is a *signed-out*
cold visit to `/`, where the largest element is sign-in text painted after the
client-side redirect. For the screen the budget is actually about — a returning
user opening onto the composer — `node apps/web/scripts/measure-home.mjs`
reports **LCP 799 ms** with a 4× CPU throttle. Honest caveat: Chrome does not
apply CDP network throttling to loopback, so that number is CPU-throttled but
not network-throttled, and is optimistic against a real slow 4G connection.

**PWA installable:** manifest, service worker, maskable icons and three
long-press shortcuts are served and were verified on the deployed URL.
Lighthouse 12 removed the PWA category, so this is asserted rather than scored.

### ☒ Keepalive and backup workflows exist and have run at least once successfully

**Fail.** Both workflows exist and are complete
(`.github/workflows/keepalive.yml`, `backup.yml`), and the repository now has a
remote, but **neither has ever run**: they are scheduled/manual and both need
secrets that do not exist until a cloud Supabase project does. They need three secrets
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`) that only exist once a
cloud project is created. The endpoint the keepalive calls (`fn_ping`) is
implemented and tested by pgTAP.

### ☑ No secrets in the repo; `.env.example` lists every variable with a comment

**Pass.** The only tracked env files are `.env.example` and
`supabase/functions/.env.example`; `.env`, `.env.local` and `supabase/.env` are
git-ignored. Every §12 variable is listed with a comment saying what it is and
where it may be used. The service-role key appears only in edge-function
documentation, never in a `NEXT_PUBLIC_*` name. `supabase/config.toml` contains
literal Twilio *placeholders* for local dev, explained in DECISIONS §14; they are
not credentials.

---

## §4 P0 scope

| Section | Status |
|---|---|
| 4.1 Phone OTP + email fallback, no passwords, 30-day session, PIN app lock, re-auth on destructive actions | Complete |
| 4.2 Three-step onboarding, seeded categories and accounts, add/rename/archive | Complete |
| 4.3 Zero-click composer, smart defaults, prediction, quick chips, edit, soft delete + undo, duplicate detection, attachments | Complete |
| 4.4 Day, month, search, party views | Complete |
| 4.5 WhatsApp linking, parsing, one reply, `undo`/`today`/`month`, message log, signed idempotent webhook | Complete |
| 4.6 CSV export of any date range | Complete |
| 4.7 Offline queue + cached shell | Complete |

**Known gaps inside P0:**

- Full offline *navigation* between tabs is bounded, as above (DECISIONS §18).
- §6.5 "long-press on a chip opens its edit menu without navigating" is **not
  implemented**. Chips are tap-to-fill only; category and account editing lives
  in Settings.
- The insight card (§6.3) uses the current-vs-previous month rule but is not
  gated on "after the first week"; it simply does not appear until there is a
  previous month to compare against.

## P1 (built after P0 acceptance)

| Item | Status |
|---|---|
| #1 Passkeys / biometrics | **Partial.** Passkey registration and unlock replace the PIN app lock. Passkey *sign-in* against the server is not built — see DECISIONS §23. |
| #2 Recurring entries | Done. Proposes on the due date, one tap to confirm, never auto-posts. |
| #3 WhatsApp reminders | Not built. |
| #4 Voice note entry | Not built. |
| #5 Receipt OCR | Not built. |
| #6 Accountant role + PDF statement | Done. Members, roles, invite codes, monthly PDF. |
| #7 Multi-business switcher | Done. |
| #8 Budgets per category | Done. In-app soft alerts at 80% and 100%. |
| #9 GST fields | Done. Optional GSTIN on parties, tax split inside the amount, GST summary. |
| #10 Google Sheets sync | Not built. |

Test coverage moved with it: **57 pgTAP** (from 35) and **126 e2e scenarios**
(from 90). Home screen is **156 KB gzipped** against the 180 KB budget.

## §10.5 / §14 deliverables

- `docs/MANUAL_TEST.md` — a 15-minute script for a non-engineer, on a real phone.
- `docs/WHATSAPP_SETUP.md` — Meta app, permanent token, webhook, 5-recipient test number.
- Screen recordings of §10.4 scenarios 2 and 7: `pnpm --filter @khata/web test:e2e:record`
  writes `.webm` files to `apps/web/test-results/`.

## What I would not ship without

1. The keepalive and backup workflows actually running green once against a real
   project. Until then the backup story is theory. (The other three CI jobs —
   unit, pgTAP, edge functions — and the e2e job are green on GitHub.)
2. Opening the CSV in Excel and Google Sheets by hand.
3. One real WhatsApp round trip through Meta's servers rather than a signed local
   payload. Everything the code controls is verified; the Meta hop is not.
