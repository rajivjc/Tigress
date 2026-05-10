# Tigress — CLAUDE.md

Tactical reference for Claude Code at session startup. Everything here
is a hard rule that future sessions need at glance. For rationale,
history, and full pattern catalogues, see `docs/`.

## Project overview

Club management platform for a bar and billiards venue in Singapore.
NOT a POS — sits alongside Qashier (POS) and Stripe (subscription
billing) as the operational and community hub. Three audiences: members
(self-service bookings, invites, social feed), staff (floor / calendar
/ walk-ins / checklists / recipes / clock / shifts), and manager+owner
(scheduling, payroll, competitions admin, settings).

## Tech stack

- Next.js 14.2.15 (App Router, Server Actions)
- React 18, TypeScript strict mode
- Tailwind CSS 3.4 (dark theme, mobile-first)
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) — Singapore region
- Stripe webhooks for subscription sync (`stripe` SDK)
- `web-push` for VAPID Web Push
- `@react-pdf/renderer` for payslip PDFs, `jszip` for batch export
- `lucide-react` icons, `@fontsource-variable/plus-jakarta-sans` typography
- Vitest 2.1 for tests
- Vercel hosting

## Mandatory verification sequence (before any commit)

```bash
npx tsc --noEmit
npm run build
npm run lint
npx vitest run
```

All four must be green. `tsc --noEmit` is non-negotiable: vitest
transpiles via esbuild without type-checking, and `next build`
doesn't type-check files outside the app's import graph. Test files
routinely escape both — only `tsc` catches type drift in tests.
See `docs/PROCESS.md` for the full rationale and audit history.

## Architecture patterns

- **Mock/real parity:** every function in `src/lib/data/`,
  `src/competitions/data/`, `src/scheduling/data/`, and
  `src/scheduling/payroll/data/` checks `isSupabaseConfigured()` and
  branches to mock or real. Both paths must stay in sync. Mock mode
  is non-negotiable — every feature must work without Supabase. Mock
  data lives in `<module>/data/mock-data.ts` and mutations modify the
  in-memory arrays in place; tests reset between runs via
  `resetMockData()` (host) and module-specific reset helpers.
- **Mock mode activation:** triggered when Supabase env vars are
  missing or left at their `.env.local.example` placeholder values.
  Test accounts are `member|staff|manager|owner@tigress.test`
  (password "password"); two extra PT staff are
  `pat@tigress.test` and `phoebe@tigress.test`.
- **Server Actions pattern:** authenticate → authorize → validate →
  call data function → revalidate paths → return
  `{ success, error? }`.
- **Role hierarchy:** member < staff < manager < owner. Each inherits
  permissions below.
- **Auth resolution:** staff table first (returns staff/manager/owner),
  then members table (returns member). Orphan auth user = sign out.
- **Timezone:** all date logic uses helpers from `src/lib/timezone.ts`.
  Never use raw `new Date()` for date boundaries. Venue is Asia/
  Singapore (UTC+8); Vercel runs UTC.
- **`server-only` import rule:** every file in `src/lib/data/` and
  every module data accessor imports `"server-only"`. Never import a
  data file from a client component.
- **Snake_case** for DB columns and the TypeScript fields that mirror
  them.
- **Route groups:** `(auth)/` public, `(member)/` all roles,
  `(staff)/` staff+, `(owner)/` owner only, `(community)/` all
  authenticated roles (feed, competitions, leagues).
- **Server actions** live in `src/app/actions/` (host) or
  `<module>/actions/` (competitions, scheduling, payroll) — one file
  per domain.
- **Migrations are append-only.** Numbered files in
  `supabase/migrations/`; never edit a shipped migration. Helper
  functions cannot reference tables before those tables exist (see
  ADR-012). Bump the SW `CACHE_VERSION` in `public/sw.js` whenever
  the precache list or offline shell changes.

## Module boundaries

- **Competitions (`src/competitions/`) is lift-out-able.** All cross-
  module imports go through three files only: `data/players.ts`
  (identity adapter), `audit.ts` (audit wrapper), `events.ts` (event
  hook). Tables prefixed `comp_*`, audit events prefixed `comp.*`.
  `tests/competitions/boundary.test.ts` is a grep guard that fails CI
  if a new integration point is added without updating the allowlist.
  See `docs/PATTERNS.md` §2 and `docs/ARCHITECTURE.md` §"Competitions
  — lift-out-able".
- **Scheduling (`src/scheduling/`) and payroll
  (`src/scheduling/payroll/`) are host-folded.** No boundary
  discipline with the host (they reach into members/staff/auth
  freely). Tables prefixed `schedule_*` and `schedule_payroll_*`,
  audit events prefixed `schedule.*` and `payroll.*`. Scheduling and
  competitions must NOT import from each other. See
  `docs/ARCHITECTURE.md` §"Scheduling + payroll — host-folded".

## Hard test rules

- **RLS NULL-coalescence:** every `CREATE POLICY` `USING` /
  `WITH CHECK` clause must have every top-level OR-branch reference
  `public.get_staff_role()`. A bare equality like
  `kind = 'giveaway'` evaluates TRUE for any caller because
  `get_staff_role()` returns NULL for non-staff and the bare
  predicate doesn't distinguish — that leaks rows to members.
  `tests/security/rls-pattern.test.ts` enforces this on every CI
  run; `tests/security/rls-allowlist.json` is for legacy backfill
  only and must not grow. See ADR-016 in `docs/DECISIONS.md` and
  `docs/PATTERNS.md` §4.
- **Proxy-on-mutation-target for atomicity tests:** when testing
  rollback in mock-mode multi-mutation functions, the throw must
  fire AFTER at least one mutation has succeeded. Wrap the target
  object with a `Proxy` whose `set` handler throws on the specific
  field that should fail (with a one-shot guard so the rollback's
  own writes succeed). Throwing on the function-call boundary or
  on the first mutation never engages the rollback path — the test
  passes whether the rollback is correct, broken, or absent. Three
  prior sessions shipped tests that didn't exercise their rollback
  paths. Canonical example:
  `tests/scheduling/payroll/data/reconciliation.test.ts`. See
  `docs/PATTERNS.md` §3 and §7.
- **Deliberate-violation verification:** every institutional-memory
  guard (security tests, atomicity tests, regression spies) must be
  audit-paired with a deliberate-violation step — comment out the
  fix, run the test, watch it fail, restore. A test that passes
  regardless is a broken test. Document the violation in the commit
  message. See ADR-013 and `docs/PATTERNS.md` §7.
- **Atomic state via Postgres RPC:** any state change that mutates
  multiple rows or has a multi-step invariant goes through an RPC,
  not application-level transactions. Existing examples:
  `deduct_credits`, `refund_credits`, `schedule_publish_week`,
  `schedule_reverse_swap`, `schedule_payroll_lock_run`,
  `comp_set_fixture_participants`. See ADR-006 and
  `docs/PATTERNS.md` §8.

## Where to find more

- `docs/ARCHITECTURE.md` — module map, data flow, auth layers,
  PWA / push / cron / realtime sub-architectures, design system,
  test architecture, repository layout
- `docs/DECISIONS.md` — 19 ADRs with full context / decision /
  consequences for every non-obvious call
- `docs/PATTERNS.md` — 16 codified test and code patterns, each
  with the bug story that motivated it
- `docs/PROCESS.md` — workflow loop, session prompt structure,
  audit methodology, fix-up patterns, sizing, single-commit
  discipline
- `docs/_handovers/` — historical phase-close handover archive
- `DEPLOYMENT.md` — deployment runbook (Supabase project setup,
  Vercel config, Stripe webhooks, VAPID, cron secrets)
- `SPECIFICATIONS.md` — Phase 1 product spec (period document)
