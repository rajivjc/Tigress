# Tigress

Club management platform for a bar and billiards venue in Singapore
(~30 members, 7 tables). NOT a POS — sits alongside Qashier (POS) and
Stripe (subscription billing) as the operational and community hub.
Three audiences: members (self-service bookings, invites, social
feed), staff (floor view, calendar, walk-ins, checklists, recipes,
clock, shift schedule), manager + owner (scheduling, payroll,
competitions admin, settings).

## Status

Phases 1, 2, and 3 complete. Production deployment at
https://tigress.vercel.app. Supabase Singapore region, live. 1173
tests passing across 95 suites. Phase boundaries are documented in
`docs/_handovers/`; the active phase's handover lives in chat
context until that phase closes.

## Stack

- Next.js 14.2.15 (App Router, Server Actions)
- React 18, TypeScript strict mode
- Tailwind CSS 3.4 (dark theme, mobile-first)
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) — Postgres,
  Auth, Realtime, Singapore region
- Stripe (`stripe` SDK) for subscription webhooks
- `web-push` for VAPID Web Push notifications
- `@react-pdf/renderer` for payslip PDFs, `jszip` for batch export
- `lucide-react` icons, `@fontsource-variable/plus-jakarta-sans`
- Vitest 2.1
- Hand-written PWA service worker (no `next-pwa` / workbox)
- Vercel hosting

## Quick start

```bash
git clone https://github.com/rajivjc/Tigress.git
cd Tigress
npm install
cp .env.local.example .env.local   # placeholders are fine for mock mode
npm run dev
```

Open http://localhost:3000.

Mock mode activates whenever Supabase env vars are missing or left at
their placeholder values. Every feature works without a Supabase
project.

## Mock test accounts

| Email | Password | Role |
|-------|----------|------|
| `member@tigress.test` | `password` | member |
| `staff@tigress.test` | `password` | staff |
| `manager@tigress.test` | `password` | manager |
| `owner@tigress.test` | `password` | owner |
| `pat@tigress.test` | `password` | staff (PT, bartender) |
| `phoebe@tigress.test` | `password` | staff (PT, floor) |

## Module map

- **Host application** (`src/app/`, `src/components/`, `src/lib/`) —
  auth and role resolution, member profiles, table booking with
  invites and atomic credit RPCs, floorplan and calendar for staff,
  walk-ins, manager block/unblock, social feed, owner settings, PWA
  shell, Web Push, Stripe webhooks.
- **Competitions** (`src/competitions/`) — tournaments
  (single-elimination), leagues (configurable, with standings
  engine, schedule generator, multi-team galas, promotion /
  relegation), polymorphic entrants (member / guest / team).
  Designed as a lift-out-able product; cross-module imports are
  gated through three integration files and enforced by a CI
  boundary test. See `docs/ARCHITECTURE.md` §"Module boundary
  invariants".
- **Scheduling and payroll** (`src/scheduling/`,
  `src/scheduling/payroll/`) — shift templates, FT standing
  assignments, PT availability, weekly draft / publish flow with
  coverage gates, clock records, swaps, no-show tracking, payroll
  runs with rate resolution and OT classification, payslip PDF
  generation, CSV export. Host-folded — reaches into members /
  staff / auth freely.

## Documentation

The four canonical engineering docs in `docs/` are the source of
truth for architecture, decisions, patterns, and process:

- `docs/ARCHITECTURE.md` — module map, data flow, auth layers, PWA
  / push / cron / realtime sub-architectures, design system, test
  architecture, repository layout
- `docs/DECISIONS.md` — 19 ADRs covering every non-obvious call
  (mock mode as a hard requirement, lift-out-able competitions,
  RLS NULL-coalescence, deliberate-violation verification, etc.)
- `docs/PATTERNS.md` — 16 codified test and code patterns, each
  with the bug story that motivated it
- `docs/PROCESS.md` — workflow loop, session prompt structure,
  audit methodology, fix-up patterns, sizing, single-commit
  discipline
- `docs/_handovers/` — phase-close handover archive (S1–S24b2-fix)
- `CLAUDE.md` — tactical reference for Claude Code at session
  startup
- `DEPLOYMENT.md` — deployment runbook
- `SPECIFICATIONS.md` — Phase 1 product spec (period document)

## Environment variables

| Name | Required for | Description |
|------|--------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | prod | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | Supabase anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | Service role key (server-side only — register API, Stripe webhook, push, soft-delete) |
| `STRIPE_SECRET_KEY` | prod | Stripe secret key (`sk_...`) |
| `STRIPE_WEBHOOK_SECRET` | prod | Webhook signing secret (`whsec_...`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | push | VAPID public key, exposed to browser |
| `VAPID_PRIVATE_KEY` | push | VAPID private key, server only |
| `CRON_SECRET` | cron | Bearer token verified by `/api/cron/*` routes |

Leave any of these at their placeholder values to disable the
corresponding feature in development. The Supabase trio gates
mock vs real mode for the entire app.

## Project structure

```
src/
  app/                       Next.js App Router
    (auth)/  (member)/  (staff)/  (owner)/  (community)/
    actions/  api/  offline/
  components/                ui/, auth/, booking/, floorplan/,
                             calendar/, member/, staff/, owner/,
                             feed/, scheduling/, payroll/, pwa/
  lib/                       data/, auth/, push/, pwa/, stripe/,
                             supabase/, types/, timezone.ts,
                             format.ts, constants.ts, youtube.ts
  competitions/              actions/, components/, data/, lib/,
                             types/  (lift-out-able module)
  scheduling/                actions/, data/, lib/  (host-folded)
    payroll/                 actions/, data/, lib/  (submodule)
  hooks/  middleware.ts
public/                      manifest.json, sw.js, offline.html, icons/
supabase/migrations/         001..024
tests/                       actions/, api/, competitions/, cron/,
                             data/, helpers/, lib/, pwa/,
                             scheduling/, security/, stripe/, stubs/
docs/                        ARCHITECTURE.md, DECISIONS.md,
                             PATTERNS.md, PROCESS.md, _handovers/
.github/workflows/           booking-reminders.yml, shift-reminders.yml
```

## Deployment

See `DEPLOYMENT.md`.
