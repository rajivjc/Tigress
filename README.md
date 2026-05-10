# Tigress

Club management platform for a bar and billiards venue in Singapore (~30 members, 7 pool tables, open 10:00–midnight). NOT a POS — sits alongside Qashier (POS) and Stripe (subscription billing) as the operational and community hub for the club. Three audiences: members (self-service bookings, invites, social feed), staff (floor view, calendar, walk-ins, checklists, recipes, clock, shift schedule), manager + owner (scheduling, payroll, competitions admin, settings).

## Status

Phases 1, 2, and 3 complete. Production deployment at https://tigress.vercel.app. Supabase Singapore region, live. 1173 tests passing across 95 suites. Phase boundaries are documented in `docs/_handovers/`; the active phase’s handover lives in chat context until that phase closes.

## Features

### Members

Members open Tigress to manage their relationship with the venue. The home dashboard shows current credit balance, upcoming bookings, and pending invites at a glance. Bookings happen on a live SVG floorplan that shows real-time table status (available, booked, occupied, blocked) for any selected date — the same component staff see, just colored from the member’s perspective.

Booking is a three-step flow: pick a table, pick a duration (1, 2, or 3 hours), pick a start time from the slots actually available on that date. Credits are deducted atomically through a Postgres RPC with row-level locking, so a double-tap on confirm can never double-charge. After booking, members invite up to a configured number of other members; invitees get a push notification and accept or decline from their phone. Cancellations refund credits atomically, blocked when a session has already started.

Members get a push reminder 45–75 minutes before each upcoming session, deduplicated per booking so a flaky network doesn’t double-notify. The social feed (separate from booking) lets members and staff post text, embed YouTube videos by pasting a URL, and link image URLs; likes are optimistic and reconcile across devices. Members can install Tigress to their home screen as a PWA — required on iOS for push notifications to work, since iOS Safari only delivers Web Push to standalone-mode apps on iOS 16.4+.

### Staff

Staff use Tigress to run the floor. The Floor view is a live floorplan combining Supabase Realtime, a 30-second polling fallback, and a visibility-change refresh on tab focus, so the screen stays accurate even when phones sleep or tabs deprioritize. Day and Week calendars surface bookings, blocks, and no-shows with utilization indicators; staff can mark a booking as a no-show within 48 hours of its end time, audit-logged.

The Walk-in form captures non-member guest details and tracks deposit amount. Member lookup searches by name, email, or phone with allowlist-validated input. Daily checklists materialize lazily for each date (manager defines the template, the day-of instance is created on first access, items can only be checked off for today, race-safe via `UNIQUE(template_id, date)` plus `ON CONFLICT DO NOTHING`). The bar recipe book is dual-searchable — by recipe name AND by ingredient name, using a pg_trgm trigram index — with category filter pills (cocktails, mocktails, shots, beer, coffee, other).

Clock in and out apply rounding rules (configurable per venue, defaults to round-to-nearest-15-minutes); missed punches can be corrected via a request that the manager reviews. Staff see their personal shift schedule, can swap a shift directly with another qualified staff member (qualification check enforced), or release a shift to the giveaway marketplace where any qualified staff can claim it. Once a payroll run is locked, staff can view their own payslips with the full line-item breakdown — regular hours, overtime, allowances, deductions — and download as PDF.

### Manager and owner

Manager plans the staff schedule each week. The flow: copy from previous week (FT standing assignments preserved, PT availability submissions picked up automatically), validate coverage against role requirements (e.g., PM Friday needs 2 bartenders, 1 floor, 1 mod-on-duty), publish to the assigned staff with push notifications. Manager reviews submitted clock corrections and approves or rejects with audit trail. Manager approves or denies shift swap requests, marks excused absences, and sees no-shows for follow-up.

Manager runs competitions: single-elimination tournaments with auto-advance, walkover handling, and manager override with cascade-revert; leagues with fully configurable points/lineup-rules/tiebreakers/promotion-relegation; multi-team galas decomposed into pairwise sub-matches; promotion and relegation between seasons (atomic via RPC, with audit-required notes when ties at division boundaries are overridden manually).

Manager and owner both can block tables for events, manage checklist templates and view checklist history, and curate the recipe book.

Owner-only: configure membership tiers (price, credits, perks, Stripe price IDs), rate cards, holidays, OT classification rules, and payslip branding (venue logo, footer text, payment terms). Owner runs payroll through a draft → review → locked lifecycle: rates resolve per-record from the configured rules (effective-dated), OT is classified per Singapore defaults (>44h/week) unless an explicit rule overrides, line items aggregate by staff and category, payslips render server-side via `@react-pdf/renderer` (no headless Chrome dependency), and a CSV batch export bundles every payslip in the run as a downloadable zip.

## Stack

- Next.js 14.2.15 (App Router, Server Actions)
- React 18, TypeScript strict mode
- Tailwind CSS 3.4 (dark theme, mobile-first)
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) — Postgres, Auth, Realtime, Singapore region
- Stripe (`stripe` SDK) for subscription webhooks
- `web-push` for VAPID Web Push notifications
- `@react-pdf/renderer` for payslip PDFs, `jszip` for batch export
- `lucide-react` icons, `@fontsource-variable/plus-jakarta-sans` typography
- Vitest 2.1 for tests
- Hand-written PWA service worker (no `next-pwa` / workbox)
- Vercel hosting, GitHub Actions for cron

## Quick start

```bash
git clone https://github.com/rajivjc/Tigress.git
cd Tigress
npm install
cp .env.local.example .env.local   # placeholders are fine for mock mode
npm run dev
```

Open http://localhost:3000.

Mock mode activates whenever Supabase env vars are missing or left at their placeholder values. Every feature works without a Supabase project — auth, booking, floorplan, walk-ins, calendars, checklists, recipes, social feed, scheduling, payroll, competitions all run against in-memory fixtures. This is the development and CI baseline.

## Mock test accounts

|Email                 |Password  |Role                 |
|----------------------|----------|---------------------|
|`member@tigress.test` |`password`|member               |
|`staff@tigress.test`  |`password`|staff                |
|`manager@tigress.test`|`password`|manager              |
|`owner@tigress.test`  |`password`|owner                |
|`pat@tigress.test`    |`password`|staff (PT, bartender)|
|`phoebe@tigress.test` |`password`|staff (PT, floor)    |

## Module map

Tigress is organized into the host application plus two business modules with deliberately asymmetric boundary discipline.

**Host application** (`src/app/`, `src/components/`, `src/lib/`). Owns identity and role resolution, member profiles, table booking with credits, the floorplan, walk-ins, the social feed, owner settings, and shared infrastructure (auth, push, Stripe webhooks, PWA shell, Supabase clients, timezone helpers). Everything member-facing and operational that isn’t competitions, scheduling, or payroll.

**Competitions module** (`src/competitions/`). Tournaments, leagues, brackets, fixtures, lineups, standings, promotion/relegation, and the surrounding tables for players, teams, game types, skill levels, and guests. Designed as **lift-out-able** — all imports between competitions and the rest of Tigress are gated through three integration files (`data/players.ts` adapter, `audit.ts` audit wrapper, `events.ts` event hook), audit events are prefixed `comp.*`, all tables are prefixed `comp_`, and `tests/competitions/boundary.test.ts` is a CI grep guard that fails if anyone adds a new integration point without updating the allow-list. The discipline exists because the competitions module may be extracted as a standalone product. See `docs/ARCHITECTURE.md` §“Module boundary invariants” for the full rules.

**Scheduling and payroll** (`src/scheduling/` with `src/scheduling/payroll/` as a submodule). Shift templates, full-time standing assignments, part-time availability, weekly draft → publish workflow with coverage validation, clock records with rounding rules, swap requests and giveaway marketplace, no-show tracking, payroll runs with rate resolution and OT classification, payslip PDF/CSV/JSON exports, owner settings for rates and holidays. **Host-folded by deliberate choice** — the module reaches into members, staff, auth, push, and audit freely because isolating it would mean either duplicating identity infrastructure or building adapter layers, neither of which earns its keep. See `docs/ARCHITECTURE.md` §“Scheduling + payroll — host-folded” for the rationale.

## Documentation

The four canonical engineering docs in `docs/` are the source of truth for architecture, decisions, patterns, and process:

- `docs/ARCHITECTURE.md` — module map, data flow, auth layers, PWA / push / cron / realtime sub-architectures, design system, test architecture, repository layout
- `docs/DECISIONS.md` — 19 ADRs covering every non-obvious call (mock mode as a hard requirement, lift-out-able competitions, RLS NULL-coalescence, deliberate-violation verification, etc.)
- `docs/PATTERNS.md` — 16 codified test and code patterns, each with the bug story that motivated it
- `docs/PROCESS.md` — workflow loop, session prompt structure, audit methodology, fix-up patterns, sizing, single-commit discipline
- `docs/_handovers/` — phase-close handover archive (S1–S24b2-fix)
- `CLAUDE.md` — tactical reference for Claude Code at session startup
- `DEPLOYMENT.md` — deployment runbook
- `SPECIFICATIONS.md` — Phase 1 product spec (period document)

## Environment variables

|Name                           |Required for|Description                                                                          |
|-------------------------------|------------|-------------------------------------------------------------------------------------|
|`NEXT_PUBLIC_SUPABASE_URL`     |prod        |Supabase project URL                                                                 |
|`NEXT_PUBLIC_SUPABASE_ANON_KEY`|prod        |Supabase anon / public key                                                           |
|`SUPABASE_SERVICE_ROLE_KEY`    |prod        |Service role key (server-side only — register API, Stripe webhook, push, soft-delete)|
|`STRIPE_SECRET_KEY`            |prod        |Stripe secret key (`sk_...`)                                                         |
|`STRIPE_WEBHOOK_SECRET`        |prod        |Webhook signing secret (`whsec_...`)                                                 |
|`NEXT_PUBLIC_VAPID_PUBLIC_KEY` |push        |VAPID public key, exposed to browser                                                 |
|`VAPID_PRIVATE_KEY`            |push        |VAPID private key, server only                                                       |
|`CRON_SECRET`                  |cron        |Bearer token verified by `/api/cron/*` routes                                        |

Leave any of these at their placeholder values to disable the corresponding feature in development. The Supabase trio gates mock vs real mode for the entire app.

## Project structure

```
src/
  app/                       Next.js App Router
    (auth)/  (member)/  (staff)/  (owner)/  (community)/
    actions/  api/  offline/
    layout.tsx  page.tsx  globals.css
  components/                ui/, auth/, booking/, floorplan/,
                             calendar/, member/, staff/, owner/,
                             feed/, scheduling/, payroll/, pwa/
  lib/                       data/, auth/, push/, pwa/, stripe/,
                             supabase/, types/, timezone.ts,
                             format.ts, constants.ts, youtube.ts
  competitions/              actions/, components/, data/, lib/,
                             types/, audit.ts, config.ts, events.ts,
                             README.md   (lift-out-able module —
                             three boundary files gate imports)
  scheduling/                actions/, data/, lib/, audit.ts,
                             types.ts   (host-folded)
    payroll/                 actions/, data/, lib/, audit.ts,
                             types.ts   (submodule under scheduling)
  hooks/                     useAuth.ts, useFloorplanRealtime.ts
  middleware.ts              (Supabase session refresh + route protection)
public/                      manifest.json, sw.js, offline.html, icons/
supabase/migrations/         001..024  (append-only, never edited)
tests/                       actions/, api/, competitions/, cron/,
                             data/, helpers/, lib/, pwa/,
                             scheduling/, security/, stripe/, stubs/,
                             setup.ts
docs/                        ARCHITECTURE.md, DECISIONS.md,
                             PATTERNS.md, PROCESS.md, _handovers/
.github/workflows/           booking-reminders.yml, shift-reminders.yml
```

## Deployment

See `DEPLOYMENT.md`.
