# Decisions

Every choice the build prompt left open, and why it went that way. Where a
decision departs from the letter of the prompt, that is called out explicitly.

---

## 1. Demo mode: a second repository behind one interface

**Decision.** All reads and writes go through `LedgerRepo`
(`apps/web/src/lib/data/types.ts`). Two implementations exist: `SupabaseRepo`
(the product) and `DemoRepo` (a deterministic browser-local dataset, selected
with `NEXT_PUBLIC_DEMO_MODE=1`).

**Why.** The prompt asks for "a runnable local environment". The Supabase local
stack needs Docker, which is not always available, and the reviewer of this
repository should be able to click a hosted URL and use the product. Demo mode
gives three things: `pnpm dev:demo` with no dependencies, a Vercel deployment
that works with no Supabase project, and a Playwright suite that runs in CI in
about a minute with no services.

**What it costs.** One interface, and the discipline of implementing every rule
twice. `DemoRepo` re-implements the role checks, the staff 7-day window, soft
deletes and `client_id` idempotency, so what you exercise locally is the same
behaviour rather than a laxer one. The authorisation that *matters* is still
RLS, and it is proved by pgTAP against real Postgres (`supabase test db`).

**What it is not.** Demo mode is not a security boundary and never claims to be.
Its data lives in `localStorage`, visible to anyone with the browser open.

## 2. Ambiguous amounts are refused, not guessed

`450 500 tea` returns `unparsed: ambiguous_amount` rather than picking the first
number. If exactly one candidate carries a money marker (`₹`, `/-`, `k`,
decimals, a leading `+`/`-`) that one wins; otherwise the sender is asked to
resend. On a money-recording path, asking again is cheaper than a wrong number
in the ledger. Every rule has a test row in `packages/parser/test/parse.test.ts`.

## 3. Confirmation totals

The confirmation message quotes today's total **of the same direction** as the
entry: an expense reports today's expenses, income reports today's income. The
prompt's example (`Saved: ₹450 expense … Today's total ₹1,230`) is ambiguous;
mixing the two into a net figure would make the number unreadable next to the
amount just saved.

## 4. Party inference for income

`received 5000 ramesh` sets the party from a bare one-or-two-word remainder,
but only for income and only when no category keyword matched. Expenses keep
the remainder as the note, because `450 tea shop` describes a purchase, not a
counterparty.

## 5. Date resolution walks backwards

A day/month with no year resolves to the most recent past occurrence, walking
back up to eight years. That makes `on 3 sep` mean last September when today is
2 September, and lands `29 feb` on the nearest leap year.

## 6. Relative dates use the business timezone

The webhook shifts "now" into the business's timezone before parsing
(`businessNow` in `supabase/functions/_shared/format.ts`). The edge runtime is
UTC; a shop in IST that types "yesterday" at 3 am means the shop's yesterday.

## 7. The parser is mirrored into `supabase/functions`, not imported

The Supabase edge runtime mounts only `supabase/functions`, so a relative import
climbing out to `packages/` resolves to nothing inside the container.
`scripts/sync-parser.mjs` copies the parser into
`supabase/functions/_shared/parser` with a "generated" header, and CI fails the
build if the mirror has drifted (`pnpm check:parser-sync`). One authored copy,
one generated copy, and a test that they cannot diverge.

## 8. Service worker is hand-written

**Departure from the prompt**, which suggested `@serwist/next` or `next-pwa`.
`apps/web/public/sw.js` is about 60 lines: stale-while-revalidate for the shell,
network-first with a cache fallback for reads, and writes explicitly excluded.
Excluding writes matters: the IndexedDB outbox is the only thing allowed to
replay a create, because it is the only thing that carries the `client_id` that
makes a replay idempotent. A plugin that queued and replayed POSTs would open a
second path to a double-entered expense.

## 9. Fonts are a CSS stack, not `next/font`

`next/font/google` fetches at build time. A CSS stack (`Inter`, then the system
UI font) keeps the build hermetic and costs nothing visually on the devices this
targets, which ship Roboto or SF.

## 10. Bundle: the data layer and the sheets load on demand

To hold the 180 KB gzipped budget (§10.6), the home screen loads without the
Supabase client, Radix Dialog, or an animation library:

- `loadRepo()` dynamically imports whichever repository is in play.
- Bottom sheets are `next/dynamic`; they only exist after a tap, and they keep
  the spring physics §6.2 asks for.
- The count-up total, the undo toast and the entry-row enter animation are
  hand-written CSS/rAF. `motion` remains only on the month route (drag to change
  month) and inside the lazily-loaded sheet.
- `@khata/parser` and `@khata/shared` are marked `sideEffects: false` so zod and
  the CSV writer do not follow `Money` into the home bundle.

Measured: **154 KB gzipped**, enforced by `pnpm check:bundle` in CI.

## 11. Export is server-side and owner-only, with a documented demo caveat

`/api/export` verifies a Supabase session and an `owner` membership before
streaming CSV, on top of RLS. Demo mode has no server session, so the route
denies by default and the demo UI exports from the browser instead. The
Playwright suite asserts staff get 403 from the route and no export control in
the UI; the Supabase smoke suite asserts the same against the real stack.

## 12. i18n without locale routing

`next-intl` with a `khata_locale` cookie and no `/[locale]` segment. A shop
owner sets their language once; URL-visible locales would add routing weight and
a migration burden for links already sent over WhatsApp. English is complete;
Hindi and Telugu carry the keys that are ready and fall back to English for the
rest, so a partial translation never blanks a screen.

## 13. PIN hashing

PBKDF2-SHA256, 210,000 iterations, 16-byte random salt, stored as
`pbkdf2$iterations$salt$hash`. A 4-digit PIN has 10,000 possibilities, so this
is a speed bump against someone holding the device, not a secret-keeping
measure — which is exactly what §4.1 asks the PIN to be, with passkeys as the
P1 replacement.

## 14. Twilio placeholders in `supabase/config.toml`

GoTrue refuses phone sign-in unless a provider is declared, even when every
number in use is covered by `test_otp`. The `[auth.sms.twilio]` block holds
literal placeholder strings; a test-OTP number short-circuits before any
provider call, so nothing there is used and nothing there is a secret.

## 15. Realtime needs an explicit publication

`supabase_realtime` starts empty. Migration `20260901000400_realtime.sql` adds
`public.entries` and sets `replica identity full`. Without it, §10.4 scenario 7
("appears within 3 seconds without reload") fails in production, not just
locally — it was caught exactly that way.

## 16. Seed timestamps are always in the past

Both seeders (`supabase/seed.sql` and the demo store) place entries strictly
before "now". Anchoring to `date_trunc('day', now()) + 8 hours` produced
entries dated later today, which sorted above a just-saved entry and made "the
entry I just added appears at the top" intermittently false.

## 17. Money never touches `number`

`Money` wraps `bigint` minor units. `Intl.NumberFormat` is the only place a
`number` appears, at the last step before pixels, and the count-up animation
runs on a copy while the value at rest always re-renders from the bigint.

## 18. Offline is viewing, plus a write queue — not full offline navigation

§4.7 asks for the shell and recent entries to be readable offline, and for
creates to queue. Both hold. What does **not** hold is switching tabs
indefinitely after the connection drops: Next's client router cache for dynamic
routes expires after about 30 seconds, and an expired route needs an RSC fetch.

Two things narrow the gap. The app warms `/month`, `/search` and `/settings`
from an idle callback, so the tabs are loaded before anyone needs them. And the
service worker answers a failed *navigation* with the cached shell, so a full
reload offline still boots the app — which then reads its data locally — rather
than showing the browser's offline error page.

Closing it completely means a build-integrated service worker that precaches
route chunks and RSC payloads. That is a real project, and it is P1.

## 19. Day boundaries belong to the business, not to UTC

Totals bucket by the business's local day (`v_daily_totals` groups on
`occurred_at at time zone b.timezone`). Anything that drills into a bucket has
to use the same boundary, or it disagrees with the number it was opened from —
in IST, filtering from UTC midnight drops every entry between 18:30 and
midnight. `zonedDayStart` / `zonedDayEnd` exist so the month drill-down and the
CSV date pickers use the same edges the totals do.

## 20. Parser branch coverage

The prompt targets 100% branch coverage on the parser. Measured: **100%
statements, ~93% branches**, with the shortfall entirely in defensive `?? ''`
fallbacks that `noUncheckedIndexedAccess` requires but that no input can reach.
The threshold is pinned in `packages/parser/vitest.config.ts` so it cannot slip.
