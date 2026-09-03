# Daybook — Technical Build Prompt

**Give this entire document to a coding agent.** It is the single source of truth for product, architecture, UI, and testability. Build **P0 only** unless the human explicitly asks for P1.

---

## 0. How to use this document

You are implementing **Daybook**, a digital daybook (daily cash ledger) for small businesses, with WhatsApp as a first-class input channel.

### Non-negotiable outcomes

1. A person can clone the repo, run one command, and **use the full P0 UI with seed data** (no cloud accounts, no Meta, no Docker required).
2. A person with a free Supabase project can switch to the live backend and use the same UI against real data.
3. WhatsApp can be **fully tested** through an in-app simulator that hits the same parser and persistence path as the real webhook.
4. The UI matches the design system in §8. It must not look like a generic dashboard template.

### Working rules

- Implement **P0 only**. Leave P1 as typed interfaces, schema comments, or `TODO(P1)` — do not build it.
- Prefer completing a thin vertical slice that is testable over scaffolding every folder.
- Money **never** flows through JavaScript `number`. Use integer minor units (`bigint` / decimal string).
- Authorization is **Row Level Security**. The UI hides actions; the database refuses them.
- No LLM on the money path. Parsing is deterministic and unit-tested.
- No AWS. No paid services required for P0.
- Do not invent extra product features, settings screens, or marketing pages beyond this spec.

### Repo you are in

This repository may already contain a pnpm workspace skeleton (`apps/`, `packages/parser`, `supabase/`). Treat existing files as a start, not as finished work. If names still say `khata`, rename user-facing strings to **Daybook**. Internal package names may stay `@khata/*` if renaming would be noisy; the product name in the UI must be Daybook.

---

## 1. Product

| | |
|---|---|
| **Name** | **Daybook** |
| **Tagline** | Today's books, already written. |
| **One-liner** | The daily cash ledger a shop owner can keep from WhatsApp or a 10-second phone tap. |
| **Category** | Single-user (P0) small-business cashbook, not full accounting software |
| **Primary user** | Owner of a shop, stall, clinic, salon, cafe, or trades business who currently writes expenses in a notebook or WhatsApp chat to themselves |
| **Job to be done** | "I need to know what went out and what came in today, without sitting down at a computer." |

### Name rationale

A **daybook** is the accounting journal where daily transactions are written first, before they are posted to ledgers. That is exactly this product. It is short, pronounceable, professional, and not confused with Khatabook / Tally / Vyapar.

Rejected alternatives (do not use): Khata (too close to Khatabook), Ledgerly, Bookkeep, Whisper.

App icon concept: a small bound notebook with a single ink stroke / today's date mark. Implement as a simple SVG wordmark + mark, not an emoji.

---

## 2. P0 vs P1

Priority is based on generic small-business ledger requirements (daily cashbook, categories, cash vs bank, simple period totals, one trusted input channel). Full double-entry, GST, invoicing, inventory, and payroll are **not** required for a useful MVP.

### 2.1 P0 — MVP (build this)

A shop owner can start the day, record money in/out in under 10 seconds, see today's position, and do the same from WhatsApp (or the simulator).

| ID | Feature | Acceptance criteria |
|---|---|---|
| P0-01 | Passwordless sign-in | User signs in with a **magic link** (email). No password field exists anywhere in P0. In demo mode, "Continue as demo" skips email. |
| P0-02 | Passkey / biometric | User can register a **passkey** (Face ID / Touch ID / Windows Hello / platform authenticator) and later unlock with it. If the browser has no WebAuthn, hide the control; do not show a broken button. |
| P0-03 | Session re-lock | After 15 minutes of inactivity, the app shows a lock screen. Unlock with passkey if registered, otherwise magic link. Demo mode does not lock. |
| P0-04 | Onboarding | First session: business name, currency (default INR), timezone (detect), opening cash on hand (optional). One screen, one primary CTA. Creates the business + default categories + default accounts. |
| P0-05 | Today home (zero-click) | Authenticated `/` **is today**. No intermediate dashboard. Shows: contextual greeting, net for today, money-in, money-out, running cash, the composer, and today's entries. |
| P0-06 | Fast composer | Always-visible amount-first entry. Amount (numeric keypad on mobile) → type (Out default / In) → optional note → optional category chip → optional account chip → save. Enter/Save commits. Success is a motion confirmation, not a page change. |
| P0-07 | Edit / delete / undo | Tap an entry to edit. Delete asks once, then offers a 5s undo toast. WhatsApp `undo` reverses the last inbound entry from that sender within 10 minutes. |
| P0-08 | Categories | Seeded defaults. User can add/rename/archive from Settings. Every entry has a category (default **Misc** if none chosen). |
| P0-09 | Accounts | Cash, UPI, Bank, Other. Each entry has an account. Today's "cash on hand" is Cash account net since onboarding opening balance. |
| P0-10 | People (lightweight) | Optional free-text **party** on an entry ("Ravi", "Milk supplier"). No party ledger page in P0. Party is stored and searchable. |
| P0-11 | Month view | `/month` — this calendar month. Net, in, out. Horizontal bar: spend by category (top 6 + Other). List grouped by day. Change month with chevrons. |
| P0-12 | Search | `/search` — filter by text, type, category, account, date range. Results are entry rows. Empty state explains an example query. |
| P0-13 | WhatsApp inbound parse | Text messages create the same entries as the composer. Grammar in §7. Unparsed messages get a short help reply, never a silent drop. |
| P0-14 | WhatsApp commands | `today`, `month`, `undo`, `help`. Replies are short and do **not** dump the full ledger. |
| P0-15 | WhatsApp simulator | Settings → WhatsApp includes a **Simulator** that POSTs into the same application service as the webhook. Required so QA works without Meta. Visible in demo mode. |
| P0-16 | WhatsApp live webhook | Edge function verifies Meta handshake + `X-Hub-Signature-256`, is idempotent on `message.id`, replies exactly once, returns 200 in < 2s. When `MOCK_WHATSAPP=1`, outbound is stored, not sent. |
| P0-17 | Number linking | Settings: user saves the WhatsApp number that may post to this business (E.164). Unlinked numbers get a polite "this number isn't linked" reply and no write. |
| P0-18 | Adaptive today | Home copy and one suggested action change by time of day and state (see §8.3). Suggestion tap fills the composer; it never auto-saves. |
| P0-19 | Category memory | Composer suggests the user's most-used category for the current hour + note keywords. Pure function, unit-tested. Never blocks save. |
| P0-20 | Multi-device web | Installable PWA (manifest + icons + standalone). Online-only in P0 aside from a "You're offline" banner. |
| P0-21 | Isolation | One user owns one business in P0. RLS ensures user A cannot read user B. Proven with a database test or a documented SQL test script. |
| P0-22 | Demo + seed | `NEXT_PUBLIC_DEMO_MODE=1` runs fully client-side with 60 days of realistic seed data for "Meera's Tea House". Playwright uses this mode. |
| P0-23 | Locale money | Format with `Intl.NumberFormat`. Support Indian grouping for INR (`1,20,000`) in both parser and display. Currency symbol from business currency. |
| P0-24 | Accessibility baseline | Contrast ≥ 4.5:1, 44px targets, visible focus, labelled inputs (never placeholder-only), `prefers-reduced-motion`, tabular nums for money. |

### 2.2 P1 — after MVP (do not build)

| ID | Feature | Why it waits |
|---|---|---|
| P1-01 | Party ledgers (udhaar / given-taken per person) | Needs its own IA; P0 only stores the name |
| P1-02 | Team seats (owner + staff) + roles | RLS model changes; 100-user cap is businesses, not staff |
| P1-03 | Receipt photo + OCR | Storage + model cost; P0 is text-speed |
| P1-04 | WhatsApp image receipts | Depends on P1-03 |
| P1-05 | Recurring entries | Nice-to-have after daily habit exists |
| P1-06 | Budgets + overspend alerts | Needs stable categories first |
| P1-07 | CSV / PDF export | Reporting, not daily use |
| P1-08 | Daily WhatsApp digest (evening push) | Outbound templates + user-initiated window rules |
| P1-09 | WhatsApp OTP as a login factor | SMS/WhatsApp cost; magic link + passkey is enough |
| P1-10 | Offline queue + sync | PWA write-queue is a reliability project |
| P1-11 | GST / VAT / tax reports | Country-specific; not a cashbook |
| P1-12 | Invoices, receivables, inventory, payroll | Different products |
| P1-13 | Bank CSV import / reconciliation | Power-user |
| P1-14 | Multi-currency inside one business | P0 is one currency per business |
| P1-15 | Multiple businesses per user | P0 is one |
| P1-16 | Attachments, tags, job/project costing | Extra taxonomy |
| P1-17 | Voice notes | Parser + storage |

### 2.3 Out of scope forever in this prompt

- AWS, Firebase, Mongo, Prisma-against-a-mystery-host
- Crypto, investments, personal-finance net-worth
- Native iOS/Android stores (PWA only)
- LLM categorization or LLM chat
- Social login (Google/Apple) in P0 — passkey + magic link only
- Admin / superuser console
- Marketing landing page beyond a minimal unauthenticated welcome

---

## 3. Stack (locked)

### 3.1 Decision

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 15** (App Router) + TypeScript + Tailwind CSS + **shadcn/ui** + **Framer Motion** | Fast to ship, PWA-capable, excellent form/a11y primitives |
| Hosting | **Vercel Hobby** (free) | Native Next.js, HTTPS, preview URLs. Not AWS. |
| Backend | **Supabase free** (Postgres + Auth + Storage + Edge Functions + Realtime) | Best free relational backend for a ledger. 50,000 MAU / 500 MB DB / 1 GB file storage — ~100 businesses is trivial. SQL + RLS matches accounting data. |
| Auth | **Supabase Auth** magic links + **SimpleWebAuthn** passkeys stored in Postgres | Passwordless + biometric without a second vendor |
| WhatsApp | **Meta Cloud API** via one Supabase Edge Function | Official, inbound is free, test numbers cost $0. Outbound only inside the user-initiated 24h window in P0 |
| Email | Supabase built-in Auth email | No extra vendor for P0 |
| Charts | **Recharts** | Accessible-enough SVG, small API |
| Icons | **Lucide** (one family, 1.5–2px stroke). Never emoji-as-icon |
| Unit tests | **Vitest** | Parser, money, category rank, date helpers |
| E2E | **Playwright** against demo mode | No secrets in CI |
| Package manager | **pnpm** workspaces | Already started in this repo |

### 3.2 Why not the other free backends

| Option | Verdict |
|---|---|
| Firebase / Firestore | Document model is a poor fit for period totals, category rollups, and money integrity. Per-read billing is the wrong shape. |
| Convex | Excellent DX, weaker SQL/reporting story for a ledger. |
| Appwrite Cloud | Fine, smaller ecosystem, weaker Postgres story than Supabase. |
| Cloudflare D1 + Workers | Free and fast, but you would rebuild auth, storage, and RLS. Wrong for a 100-user MVP timeline. |
| Neon + Clerk + separately hosted functions | Excellent, but three vendors to wire. Supabase is one project. |
| PocketBase | Fine for a hobby box, not a zero-ops free cloud the human can open in a browser. |

Supabase free **pauses after 7 days idle**. Ship a GitHub Action or `vercel.json` cron that `GET`s `/api/health` weekly (the health route runs `select 1`). Document this in the README. Data is not deleted on pause.

### 3.3 Suggested repo layout

```
apps/web/                     # Next.js Daybook
packages/parser/              # WhatsApp/composer grammar, zero runtime deps
packages/shared/              # Money, Zod schemas, category rank, types
supabase/migrations/          # Versioned SQL
supabase/functions/whatsapp-webhook/
supabase/seed.sql
docs/AGENT_PROMPT.md          # this file
docs/MANUAL_TEST.md           # generated by you as you build
```

All UI reads/writes go through `apps/web/src/lib/data/repo.ts`. Implementations:

- `demoRepo` — in-memory / localStorage, used when `NEXT_PUBLIC_DEMO_MODE=1`
- `supabaseRepo` — real client

E2E and `pnpm dev` default to demo unless `.env.local` says otherwise.

---

## 4. Architecture

```
WhatsApp user ──► Meta Cloud API ──► whatsapp-webhook (Edge)
                                          │
                                          ├─ verify signature + handshake
                                          ├─ idempotency on message.id
                                          ├─ packages/parser
                                          ├─ insert entries + whatsapp_messages
                                          └─ send exactly one reply
                                               (or log if MOCK_WHATSAPP=1)

Phone / desktop ──► Next.js (Vercel)
                       ├─ composer / today / month / search / settings
                       ├─ repo.ts
                       └─ Supabase JS (RLS)   or   demo store

Simulator UI ──► POST /api/whatsapp/simulate ──► same domain service
                 as the webhook (not a fake second parser)
```

### 4.1 Money

```ts
// packages/shared — conceptual
type Money = { currency: string; minor: bigint }; // INR rupee → 2 digits; never number
```

- Postgres: `amount_minor bigint not null check (amount_minor > 0)` plus `currency char(3)`.
- Wire format: decimal string (`"150000"` = ₹1,500.00).
- Parser accepts `500`, `500.50`, `1,500`, `1,50,000`, `1.5k`, `2k`, `₹500`.
- Reject `0`, negative, and amounts above `99_99_99_900` minor units (₹99,99,999.00) as `amount_too_large`.

### 4.2 Dates

Entries store `booked_on date` in the **business timezone**, plus `created_at timestamptz`. The composer defaults `booked_on` to "today" in that timezone. WhatsApp `yesterday` is relative to business tz.

---

## 5. Data model (P0)

Use UUID PKs. Enable RLS on every table. `updated_at` trigger on mutable rows.

### 5.1 Tables

**profiles**  
`id uuid pk references auth.users` · `display_name text` · `email text` · `created_at`

**businesses**  
`id` · `owner_id → profiles` · `name` · `currency char(3)` · `timezone` · `opening_cash_minor bigint default 0` · `whatsapp_e164 text unique null` · `created_at`

**categories**  
`id` · `business_id` · `name` · `kind` (`expense` \| `income` \| `both`) · `archived_at` · `sort`

**accounts**  
`id` · `business_id` · `kind` (`cash` \| `upi` \| `bank` \| `other`) · `name` · unique `(business_id, kind)`

**entries**  
`id` · `business_id` · `type` (`expense` \| `income`) · `amount_minor bigint` · `currency` · `booked_on date` · `note text` · `party text null` · `category_id` · `account_id` · `source` (`app` \| `whatsapp` \| `seed`) · `whatsapp_message_id text null` · `created_by` · `created_at` · `deleted_at null`

Soft-delete only. Totals ignore `deleted_at is not null`.

**whatsapp_messages**  
`id` · `business_id null` · `direction` (`in` \| `out`) · `provider_message_id text unique` · `from_e164` · `body` · `parse_result jsonb` · `entry_id null` · `created_at`

**passkeys**  
`id` · `user_id` · `credential_id bytea unique` · `public_key bytea` · `counter bigint` · `transports` · `created_at` · `last_used_at`

**auth_challenges** (WebAuthn)  
`id` · `user_id` · `type` (`register` \| `authenticate`) · `challenge` · `expires_at`

### 5.2 Seed categories

Expenses: Rent, Utilities, Stock, Salaries, Transport, Food & tea, Marketing, Fees, Maintenance, Misc  
Income: Sales, Services, Other income

### 5.3 RLS sketch

- `profiles`: `id = auth.uid()`
- `businesses`: `owner_id = auth.uid()`
- Child tables: `business_id in (select id from businesses where owner_id = auth.uid())`
- Edge webhook uses the **service role** and must still resolve the business by `whatsapp_e164` before insert. Never insert if unlinked.

### 5.4 Views / functions

- `v_today_totals(business_id, on_date)` → in, out, net, cash_on_hand
- `v_month_totals` + `v_category_spend`
- `fn_predict_category(business_id, note, hour)` — also mirrored as a pure TS function in `packages/shared`

---

## 6. Auth and security UX

### 6.1 Flows

1. **Welcome** — Daybook wordmark, one line of meaning, two actions: `Use passkey` · `Email me a link`. Demo button is visually secondary, labelled "Explore a sample shop".
2. **Magic link** — Supabase `signInWithOtp({ email, shouldCreateUser: true })`. Copy: "We sent a link. It expires in 1 hour." No "resend" spam: 30s cooldown.
3. **Passkey register** — after first login, a contextual prompt: "Unlock Daybook with this device next time." Dismissible; Settings can add later.
4. **Passkey login** — `navigator.credentials.get` → verify against `passkeys`.
5. **Lock screen** — same visual language as welcome, no navigation chrome, amount numbers on the previous screen must not be visible behind a weak blur. Use a solid paper overlay.

### 6.2 Rules

- No password fields, no "forgot password", no password strength meters.
- Do not log session tokens, magic links, or WhatsApp access tokens.
- Service role key only in Edge Functions, never in `NEXT_PUBLIC_*`.
- Rate-limit `/api/whatsapp/simulate` to signed-in users of that business (demo: local only).
- Webhook: HMAC-SHA256 over the **raw** body; reject if missing/invalid except when `MOCK_WHATSAPP=1` **and** the request is the simulator with a server-side demo secret.

---

## 7. WhatsApp

### 7.1 Grammar (`packages/parser`)

Input is one text message, trimmed, case-insensitive keywords, original note casing preserved.

**Entry (default type = expense)**

```
[in|income|got|received|sale]? <amount> <note...>? [via cash|upi|bank|other]?
[out|paid|spent|expense]? <amount> [to <party>]? <note...>?
```

Examples that **must** pass as golden tests:

| Message | Result |
|---|---|
| `500 tea` | expense 500.00, note tea, category Food & tea |
| `tea 500` | same |
| `₹1,500 rent` | expense 1500.00, category Rent |
| `in 2000 cash sale` | income 2000.00, account cash, category Sales |
| `got 3500 from walk-in` | income, party null, note from walk-in |
| `paid ravi 1500 sugar` | expense, party Ravi, note sugar, category Stock |
| `2k petrol via upi` | expense 2000.00, account upi, category Transport |
| `1.5k` | expense 1500.00, note empty, Misc |
| `yesterday 800 diesel` | booked_on = yesterday |
| `undo` | command undo |
| `today` | command today |
| `month` | command month |
| `help` | command help |

**Failures:** empty, no amount, two different amounts, zero, too large.

Do **not** use an LLM. Keyword maps for categories live in `packages/parser`. Unknown notes still save (Misc).

### 7.2 Replies (keep them short)

| Event | Reply |
|---|---|
| Saved expense | `Noted. ₹500 out · Tea · today. Send "undo" in 10 min if that's wrong.` |
| Saved income | `Noted. ₹2,000 in · Sales · today.` |
| Unparsed | `I need an amount. Try: 500 tea  ·  in 2000 sale  ·  paid Ravi 1500` |
| Unlinked number | `This WhatsApp isn't linked to a Daybook. Open the app → Settings → WhatsApp.` |
| today | `Today: in ₹8,200 · out ₹3,410 · net ₹4,790` |
| month | `September: in ₹1,20,400 · out ₹88,210 · net ₹32,190` |
| undo ok | `Removed ₹500 tea.` |
| undo fail | `Nothing to undo.` |
| help | Four example lines, no marketing |

Never send a full entry list on WhatsApp in P0 (privacy + cost).

### 7.3 Webhook

- `GET` — echo `hub.challenge` when token matches.
- `POST` — iterate `entry[].changes[].value.messages[]` and `statuses[]`. Dedup `messages[].id`.
- Respond 200 immediately after enqueue/sync write. P0 may write inline if it stays < 2s.
- Local live-Meta testing: Cloudflare Tunnel or ngrok to the functions port. Document in `docs/WHATSAPP_SETUP.md`.

### 7.4 Simulator

UI: a phone-frame thread. User types a message as the shop owner. The thread shows the exact reply the webhook would send. Messages persist in demo store / `whatsapp_messages`.

This is how Playwright tests WhatsApp.

---

## 8. UI / UX (locked)

The product is a **paper daybook**, not a crypto dashboard and not glassmorphism-for-its-own-sake.

### 8.1 Design system

**Style:** Swiss grid + soft paper depth. Light-first. Dark mode is a first-class pair, not an invert.

**Surfaces (light)**

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F7F4EF` | App background (warm paper) |
| `--ink` | `#1C1917` | Primary text |
| `--ink-soft` | `#57534E` | Secondary text |
| `--rule` | `#E7E1D6` | Hairline rules, not heavy cards |
| `--surface` | `#FFFcf7` | Composer / sheets |
| `--accent` | `#0F766E` | Primary actions, today mark (trust teal) |
| `--accent-ink` | `#FFFFFF` | Text on accent |
| `--in` | `#047857` | Money in (with a leading + and ↑ icon — never color alone) |
| `--out` | `#B91C1C` | Money out (with − and ↓) |
| `--warn` | `#B45309` | Undo window, lock |
| `--focus` | `#0F766E` | 2–3px ring |

**Surfaces (dark):** background `#1C1917`, surface `#292524`, text `#F5F2EB`, rules `#44403C`, same accent/in/out (check contrast).

**Type**

- Display / today net: **Fraunces** (opsz 144, soft optical size) — the "page number" of the daybook
- UI / body: **Inter** 400–600, 16px body
- Money: **JetBrains Mono** or Inter tabular-nums, always
- Scale: 12 / 14 / 16 / 20 / 28 / 40. Today net may go to 40–48 on mobile, 56 on desktop. Do not use 12rem hero type inside the app chrome.

**Shape & depth**

- Radius 12px on composer and sheets, 8px on chips, 999 on pills
- Shadow: `0 1px 2px rgb(28 25 23 / 0.04), 0 8px 24px rgb(28 25 23 / 0.06)` — one elevation only
- No blur-behind-everything. Backdrop blur is allowed only on the lock overlay and modal scrim (40–60% ink)

**Icons:** Lucide, 20–24px, consistent stroke. Nav icons + labels (never icon-only nav).

### 8.2 The five product principles (implement, don't poster)

**1. Micro-interactions and motion feedback**

| Interaction | Motion |
|---|---|
| Press chip / button | Scale 0.97 → 1, 120ms, ease-out. Color wash, no layout shift |
| Save entry | Composer amount snaps to 0; a new row **enters from 8px below** at 40% opacity → 100%, 220ms. Net figure **ticks** (number interpolate, 300ms) |
| Delete | Row collapses height via grid-template / auto-animate; undo toast springs from bottom |
| Month / today switch | Shared-element feel: the net number is the hero; crossfade lists 180ms |
| Lock | Solid paper sheet rises 16px, 200ms |
| Reduced motion | Crossfade only, no ticks, no springs |

Use Framer Motion. Durations 150–300ms. Exit faster than enter (~70%). Animate `transform` and `opacity` only. Stagger today's rows 30–40ms on first load, **not** on every save.

**2. Contextual and adaptive UI**

Home is a function of `(now, totals, lastEntry, hourHistogram)`:

| Context | Greeting / prompt | Suggested action (one) |
|---|---|---|
| 05:00–11:00, 0 entries | "Morning. Start the book." | "Opening stock?" |
| 11:00–16:00, has entries | "Afternoon. {n} logged." | Most common category this hour |
| 16:00–21:00 | "Evening close." | "Any last expense?" |
| 21:00–05:00 | "Late page." | Hide suggestions; composer still works |
| 0 entries after 18:00 | "Nothing today. That's ok." | "Add yesterday" (fills date) |
| Large single out (> 3× median) | Soft inline note, not a modal | "Looks large — category?" |

Suggestions fill the composer. They never persist until the user saves.

**3. Password-less, biometric, security-centered UX**

- Welcome and lock are calm paper, not a bank vault illustration
- Explain *why* in one line: "No passwords to forget. This device unlocks Daybook."
- Settings → Security: list passkeys by device name + last used, remove passkey, change email
- Never preview ledger digits on the lock screen
- WhatsApp replies omit party names if the note is long; keep amounts + category only when needed

**4. Zero-click navigation**

- `/` is the work. There is no Home → Dashboard → Add Expense
- Bottom nav has **three** items only: **Today · Month · Search**. Settings is a 32px mark top-right, not a fourth tab
- Composer is *on* Today, not a modal route
- Deep links: `/`, `/month?ym=2026-09`, `/search?q=tea`, `/settings`, `/settings/whatsapp`
- Desktop ≥1024: left rail with the same three + the today net pinned; composer stays in the main column
- Opening from a WhatsApp reply (when we add app links later) lands on Today with the new row highlighted. In P0, highlight `?highlight=<entryId>`

**5. Minimalist UI, but with actual meaning**

Every element on Today must answer one of: *What is today? What just happened? What do I do next?*

Remove: greeting that doesn't change, decorative charts with < 4 points, "Quick actions" grids, gradient orbs, glass cards, empty KPI rows, onboarding carousels, confetti.

Keep: the date (e.g. **Wednesday 2 September**), the net with in/out subline, the composer, the list, one suggestion.

Empty Today: a single ruled line and "The page is blank. Type an amount."

### 8.3 Navigation map

```
Welcome ─┬─ magic link / passkey ─► Onboarding (once) ─► Today
         └─ Explore demo ──────────────────────────────► Today (banner: "Sample shop")

Today ── Month
      └── Search ── entry sheet (edit)
      └── Settings ── Security
                   └── WhatsApp (link + simulator)
                   └── Categories
                   └── Business
```

### 8.4 Screen specs (P0)

**Today**  
Top: date + settings mark. Hero: net (Fraunces) + `+in / −out` + cash on hand in soft ink. Suggestion chip (optional). Composer card. List of today, newest first, swipe or overflow to edit/delete.

**Composer**  
Big amount. Segmented In / Out. Note field. Horizontal chips for category (scroll). Account as 4-segment control. Primary button label: `Log ₹500` (live). Disabled when amount empty.

**Month**  
Month name. Same net language. Horizontal bars for categories (value labels on the bar). Day sections. Tap a day → Today with that date (`/?d=2026-09-02`) — this is allowed; it is still one tap from meaning.

**Search**  
Immediate focus on the field. Filters as chips. Results reuse the entry row component.

**Settings / WhatsApp**  
E.164 input with country helper. Connection state. Simulator thread. Copy-paste webhook URL + verify token (live mode only).

**Welcome / Lock**  
As §6. No marketing carousel.

---

## 9. Application services (so demo, UI, and webhook stay identical)

Implement a single TypeScript module used by Next route handlers and documented as the contract the Edge function should call conceptually (Edge may import `packages/parser` + `packages/shared` and speak SQL directly, but parse + total + reply strings must come from the same packages).

```ts
logEntry(input: NewEntry): Entry
listEntries(filter): Entry[]
totals(range): Totals
undoLastWhatsApp(e164): Entry | null
handleInboundText(e164, body, providerId): { reply: string; entry?: Entry }
```

Reply copy lives in `packages/shared/replies.ts`, not in JSX and not duplicated in the Edge function.

---

## 10. Build order

Do these in order. After each step, the repo must be runnable.

1. **Workspace + demo app shell** — Today screen with static seed, design tokens, fonts, PWA manifest, bottom nav.
2. **`packages/shared` Money + `packages/parser`** — full golden tests. CI must run them.
3. **`demoRepo` + composer** — logging, edit, delete, undo, month, search. All P0 screens on fake data.
4. **Auth UI + lock + passkey** — demo bypass; real Supabase wired behind env.
5. **Onboarding + adaptive copy + category memory.**
6. **Simulator + `/api/whatsapp/simulate` + shared replies.**
7. **Supabase migrations + RLS + seed + webhook function + MOCK_WHATSAPP.**
8. **Playwright** for the journeys in §11. **docs/MANUAL_TEST.md** and README run instructions.
9. **Health route + keepalive workflow.** Stop.

Do not start a design-system Storybook, marketing site, or native wrapper.

---

## 11. Test plan (the agent must leave these working)

### 11.1 Unit (Vitest)

- Parser: every row in §7.1 plus: extra spaces, Arabic digits if easy, mixed `Rs. 500`, rejection cases
- Money: parse/format INR, USD; never precision-loss on `1.10`
- Category rank: keyword hit beats recency; empty note → null
- Reply strings: undo / unparsed / unlinked

Target: parser branches covered. No 100% vanity requirement on React.

### 11.2 Playwright (demo mode)

Cover:

1. Explore demo → Today shows a non-zero net and a list
2. Log `75` / note `biscuits` / save → row appears, net ticks, composer clears
3. Delete that row → undo toast → undo restores
4. Month shows bars and at least one day group
5. Search `tea` returns rows
6. Open WhatsApp simulator, send `500 tea`, see the "Noted" reply and a new Today row
7. Simulator `undo` removes it
8. Keyboard: tab through composer, focus ring visible
9. `prefers-reduced-motion`: app still usable (save still works)

### 11.3 WhatsApp live (optional, documented)

`docs/WHATSAPP_SETUP.md`: Meta app, test number, tunnel, verify GET, send `500 tea` from a linked personal WhatsApp, confirm entry.

### 11.4 Manual script (`docs/MANUAL_TEST.md`)

A 15-minute checklist the human can run on a phone (Safari / Chrome) and desktop. Include lock screen, passkey (if device supports), magic link (if Supabase configured), and simulator.

### 11.5 Commands the README must document

```bash
pnpm install
pnpm dev                 # demo mode by default
pnpm test                # unit
pnpm test:e2e            # playwright
# optional
pnpm db:start            # local supabase
pnpm db:reset
```

Default `.env.example` has `NEXT_PUBLIC_DEMO_MODE=1` and `MOCK_WHATSAPP=1`.

---

## 12. Seed story (demo)

**Meera's Tea House** · INR · Asia/Kolkata  
Opening cash ₹5,000  
~60 days of morning milk/sugar stock, hourly tea sales (income), evening gas/oil, weekly rent on the 1st, a UPI electricity bill mid-month, one "paid Ravi" stock run. Weekends lighter. This is what makes Month look real.

---

## 13. Definition of Done (P0)

The agent may stop only when all of these are true:

- [ ] Product name **Daybook** appears in the UI, title, and PWA name
- [ ] `pnpm install && pnpm dev` opens Today with seed data and no console errors
- [ ] All P0 IDs in §2.1 are implemented or explicitly waived in `docs/DECISIONS.md` with a reason
- [ ] No P1 features shipped as half-UI
- [ ] Unit + Playwright tests pass locally
- [ ] README: demo path, Supabase path, WhatsApp mock vs live, keepalive note
- [ ] `docs/MANUAL_TEST.md` and `docs/WHATSAPP_SETUP.md` exist
- [ ] Light and dark both meet contrast; 375px and 1280px layouts work
- [ ] Money path has no `number` arithmetic
- [ ] No AWS services, no paid APIs required to demo

---

## 14. Decisions already made (do not reopen)

1. Name is Daybook.
2. Backend is Supabase free + Vercel Hobby.
3. P0 is a single-owner cashbook, not double-entry accounting.
4. WhatsApp parser is deterministic.
5. Demo mode is first-class so the human can test without accounts.
6. Light paper UI, teal accent, Fraunces + Inter — not dark-gold-crypto, not glassmorphism wallpaper.
7. Three-tab nav. Today is the product.

If something in this prompt is technically impossible in a browser, pick the closest WebAuthn / PWA equivalent, write it in `docs/DECISIONS.md`, and continue.
