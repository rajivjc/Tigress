# Tigress — Project Handover

Last updated: end of S24b2-fix audit, ready for the next session (Phase 2 Tier 4 or Phase 3, RC’s call).

## What Tigress is

Tigress is a club management platform for a bar and billiards venue in Singapore (~30 members, 2 FT + 4 PT staff, 1 manager, 2 owners, 7 identical pool tables, open 10:00–midnight). It’s the operational and community hub — sitting alongside Qashier (POS) and Stripe (membership billing) but not replacing either. Three audiences: members book tables and join competitions, staff handle floor/walk-ins/checklists/recipes, manager+owners configure everything plus payroll (Phase 3).

## Tech stack

- Next.js 14.2 App Router, TypeScript strict mode, Tailwind CSS dark theme
- Supabase Postgres + Auth, Singapore region (ap-southeast-1), live in production. RLS on every table.
- Stripe (webhook-based subscription sync only, not used for in-app billing)
- Vercel hosting, GitHub Actions for cron
- Web Push API + VAPID, hand-written PWA service worker
- Vitest for tests
- Repo: https://github.com/rajivjc/Tigress

## Workflow

Spec written in Claude chat → Claude Code executes → audit in Claude chat → fixes folded into next session prompt. One feature scope per session, splittable when scope is heavy. Mock mode (`isSupabaseConfigured()` check + in-memory fixtures) maintained throughout — every feature works without Supabase. CLAUDE.md at repo root is the project-intelligence doc Claude Code reads at the start of each session — it includes the mandatory verification sequence (`tsc --noEmit` → `next build` → `next lint` → `vitest run`).

## Where things stand

**Phase 1 — “The Floor”** (Sessions 1–13): Complete and in production. Auth, member profile, table booking with credits, floorplan, session invites, staff floor/calendar/walk-in, owner settings/rates, Stripe webhooks, security hardening, UI polish, responsive calendar.

**Phase 2 — “The Bar”** (Sessions 14–24b2-fix): All planned tiers complete.

- Tier 1: PWA, push notifications, no-show tracking, booking reminders
- Tier 2: Daily checklists, recipe book
- Tier 3 (Sessions 20–24b2-fix): Social feed + complete competitions module:
  - **S20** — Social feed (community feed, polymorphic authorship, YouTube embeds, image URLs, likes, soft-delete moderation)
  - **S21** — Competitions module foundation. Lift-out-able under `src/competitions/`, all tables `comp_`-prefixed, identity flows through Player adapter (`src/competitions/data/players.ts`), boundary enforced by static grep test
  - **S22** — Single-elimination individual tournaments. Pure bracket generator + cascade-revert on manager overrides
  - **S23** — League foundation. Seasons + divisions, fixtures, lineups, pure standings. One supported config: single round-robin / win=3,draw=1,loss=0 / strict roster / head-to-head + sub-match-diff tiebreakers
  - **S24a / S24a-fix** — Schedule generator (Berger circle method, single + double RR, bye handling, optional date stamping) + multi-team galas (N-team fixtures decomposed into pairwise sub-matches via `comp_fixture_pairings`)
  - **S24b1 / S24b1-fix** — Standings engine completion. Alternative points configs (`win_loss` with tied-resolution + `per_sub_match`), lineup rules (`loose` + `sub_with_approval` with opposing-captain approval flow), 10 supported tiebreakers, frame-level scores threaded from match_results
  - **S24b2 / S24b2-fix** — Promotion/relegation (manager-driven finalize action, `comp_promotion_decisions` audit table, ties detected at boundaries with required-note overrides, atomic via RPC), N+1 cleanup bundle (`v_lineup_approvals_for_captain` view, `getTeamsByIds`, `findDivisionsByTiers`), replay-required audit lifecycle wired to fixture auto-complete

The competitions module is **engine-complete**. No further engine sessions queued.

## Codebase shape

- 17 migrations, ~36 tables, 49 audit-event types under `comp.*`
- **740 tests passing**, type-check clean, lint clean, build clean
- Test breakdown across competitions: bracket lib 23, schedule lib 26, standings lib ~80 (incl. tiebreakers + galas + bye + replay), promotion-planner 16, league action tests, plus comprehensive data-layer tests
- Boundary test (`tests/competitions/boundary.test.ts`) does grep-based import checking in both directions, repeatedly verified to catch deliberate violations
- Mock/real parity preserved across every data-layer function

## Competitions module — current shape

```
src/competitions/
  README.md                         boundary doc
  config.ts                         module constants
  audit.ts                          writeCompAuditLog (prefixes comp.*)
  events.ts                         emitCompEvent placeholder
  data/
    players.ts                      Player adapter — only file with host imports
    competitions.ts, entrants.ts, matches.ts, match-results.ts
    teams.ts                        + getTeamsByIds (S24b2 N+1 fix)
    team-members.ts, guests.ts, game-types.ts, skills.ts
    bracket.ts                      S22
    seasons.ts, divisions.ts        + findDivisionsByTiers (S24b2-fix)
    fixtures.ts, lineups.ts         + approval state (S24b1)
    fixture-pairings.ts             S24a galas
    fixture-participants.ts         S24a galas
    league-standings.ts             + replayRequired discriminated union (S24b1-fix)
    promotions.ts                   S24b2
    mock-data.ts
  lib/
    bracket.ts                      S22 pure
    schedule.ts                     S24a Berger generator + gala pairings
    standings.ts                    + alternative points configs + 10 tiebreakers + frames
    promotion-planner.ts            S24b2 pure
  actions/
    competitions.ts, entrants.ts, matches.ts, teams.ts, guests.ts, skills.ts
    registration.ts, bracket.ts, seeding.ts, results.ts            S22
    seasons.ts, divisions.ts, fixtures.ts, lineups.ts              S23
    league-results.ts, leagues.ts                                  S23
    schedule-generator.ts                                          S24a
    galas.ts                                                       S24a
    lineup-approvals.ts                                            S24b1
    promotion.ts                                                   S24b2
  components/                       (22 files; full league UI shipped)
  types/index.ts                    49 audit event types, full league config shape
```

### Module boundary invariants — non-negotiable

- Nothing outside `src/competitions/` imports from inside it except: route pages in `src/app/(community)/competitions/`, `src/app/(community)/leagues/`, and the nav entry in `StaffSidebar.tsx`
- Nothing inside imports from elsewhere in Tigress except via `players.ts` (Player adapter), `audit.ts`, `events.ts`, or shared primitives (`@/lib/supabase/env`, `@/lib/timezone`, `@/lib/types`)
- All audit events prefixed `comp.*`
- All tables prefixed `comp_`
- Dual-mode pattern (`isSupabaseConfigured()` + mock fallback) preserved for every data-layer function
- The boundary test must continue to pass; deliberate-violation injection at the end of every session that touches the module

## What’s on the roadmap

The original handover named two unbuilt areas. Both are open as candidates for the next session:

### Phase 2 — remaining items

- **Notifications** — beyond the booking-reminder push that exists in Tier 1. Likely scope: per-user notification preferences, in-app inbox, additional event types (competition invites, lineup approval requests, fixture cancellations, etc.)
- **CRM enrichment** — member tagging, notes, lifecycle stages, contact-history aggregation. Owner+manager visibility.

### Phase 3 — back-office module

- **Employee scheduling** — staff shift planning, swap requests, availability constraints, integration with the floor app
- **Payroll** — hours from scheduling, rates from owner settings, monthly/fortnightly runs, export to whatever format the venue’s accountant uses

There’s no implementation order constraint between any of these. RC’s call which to scope first.

## Things to ask RC before writing the next spec

1. **Which area first** — Phase 2 notifications, Phase 2 CRM, Phase 3 scheduling, or Phase 3 payroll?
1. For whichever is picked, the standard scoping conversation — concrete venue requirements, what’s manual today vs. what needs automating, integration with existing modules
1. Anything from the Spring 2026 mock-mode testing that surfaced gaps in the competitions module not captured above? (Asked at the start of every session for completeness — most recent answer was none.)

## Key learnings & principles (from the past 24+ sessions)

- **The competitions module boundary is architecturally critical** — violations must be caught by automated tests, not convention
- **Pure functions get full test coverage** — `lib/standings.ts` (~80 tests), `lib/schedule.ts` (26 tests), `lib/promotion-planner.ts` (16 tests), `lib/bracket.ts` (23 tests). Every algorithmic component is testable in isolation
- **Defense-in-depth for authorization** — RLS policies and server-action authz checks both required, neither sufficient alone
- **Atomic state changes via RPC** when an action touches multiple tables that must succeed/fail together (precedents: `comp_set_fixture_participants`, `comp_finalize_division_promotions`)
- **Side-effecting reads are an anti-pattern** — caught and fixed in S24b1-fix (audit writes from a standings loader). Audit emission belongs at action transition points
- **Verification sequence is mandatory and includes `tsc --noEmit`** — vitest’s esbuild transpile and `next build` both miss type drift in test files. Caught a blocker in S24b1; permanent in CLAUDE.md since
- **Pattern of test-fossil cleanup** ran S22 → S24b2; resolved itself by S24b2-fix. Watch for recurrence in the next module
- **Mock/real parity is non-negotiable** — every feature must work in both modes. Caught: cascade gaps, atomicity gaps, isolation leaks. All fixed
- **N+1 patterns sneak in even when explicitly being audited for** — S24b2 itself introduced one (`findDivisionByTier` in a loop) while removing three others. The pattern needs explicit attention every session, not just declared sessions

## Approach & patterns

- **Audit methodology:** RC passes Claude Code output back to Claude chat for structured audits checking test suite results, TypeScript cleanliness, database constraints, RLS policies, component behavior, module boundaries. Claude injects deliberate violations to verify tests actually catch them.
- **Build verification sequence (mandatory before commit):** `npx tsc --noEmit` → `npm run build` → `npm run lint` → `npx vitest run` — all four must pass before a session is considered clean. This is documented in `CLAUDE.md`.
- **Git audit pattern:** `git log --oneline -15` → `git diff [hash]..[hash] --stat` → targeted per-file diffs by domain (data layer, actions, components separately).
- **Spec format:** Structured Q&A for requirements gathering → detailed written spec → Claude Code implementation → audit → fix-up spec for any blockers/findings → next-feature spec incorporates all deferred items
- **Session sizing:** When scope feels heavy after the scoping conversation, splitting into S{N}a / S{N}b is preferred over one heroic session. Precedents: S24a/b, S24b1/b2.
- **Prompts:** Structured, prioritized, with explicit mock/real parity requirements, verification steps, single-commit messages, and a deliberate-boundary-violation step.

## Tools & resources

- **Repo:** https://github.com/rajivjc/Tigress (Claude Code clones to `/home/claude/Tigress`)
- **Supabase** (Postgres + Auth, Singapore region) — live in production, owners actively testing
- **Stripe** — webhook-based billing
- **Qashier** — POS system kept separate from Tigress
- **Vercel** — hosting
- **Vitest** — test suite (740 tests as of S24b2-fix)
- **CLAUDE.md** at repo root — project intelligence doc, includes mandatory verification sequence

## Module’s possible future as a standalone product

RC has flagged that the competitions module might one day be lifted out into its own app. The boundary discipline (Player adapter, `comp_` prefix, module-internal mock data, `comp.*` audit prefix, `comp_*` table prefix, README extraction guide, all algorithms as pure libs with comprehensive tests) is in place to make that feasible. Every session that touches the module continues to respect this — no new direct couplings to host identity, no host-table reads outside the adapter layer.

The module currently supports:

- Tournaments (single-elimination individual)
- Leagues (team-based, full configurability for points / lineup rules / tiebreakers)
- Galas (multi-team fixtures with pairwise decomposition)
- All four pool variants the venue plays + handicap (manual race-to per match, with display skill levels separate)
- Both individual and team competitions
- Both invited and paying guest entry (4 guest policy enums; `comp_guests` table is module-owned)
- Promotion/relegation between seasons via explicit `next_season_id` linking
- Substitution approval workflow with opposing-captain authority

What’s not in scope for the module yet — and would be additional sessions if RC wants them in the standalone product but not for the venue today: ladder formats, casual matches, Swiss-system tournaments, double-elimination brackets, knockout-with-consolation formats, gala variants beyond round-robin-within and manual.

## Repo state to start from

`main` branch at the most recent commit (S24b2-fix merge, hash `08e139e`). All four verification checks green. 740 tests passing.

## Key context for the next chat

If you (the next Claude) are picking this up: RC’s workflow is structured prompts written here, Claude Code executes them, then audits happen back here. RC values rigor — pure functions get tested in isolation, mock/real parity is non-negotiable, and every session ends with a deliberate boundary-violation check. Defense-in-depth is preferred over either-or. RC is happy to split sessions when scope is too big — propose a split if appropriate.

When starting the next session: read `CLAUDE.md` at the repo root for the canonical workflow rules, then ask RC the three scoping questions above before drafting anything.
