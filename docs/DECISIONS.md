# Architecture decision records

This file is an immutable, append-only record of decisions whose
*reasoning* would otherwise be lost. ADRs do not change once written:
when a decision is overturned, write a new ADR that supersedes the
old one.

Each ADR uses the format:

```
## ADR-NNN: Title

**Status:** Accepted | Superseded by ADR-MMM
**Date:** YYYY-MM-DD

**Context** — what forced the decision
**Decision** — what we chose
**Consequences** — both sides of the trade-off
```

Dates use git commit timestamps (Asia/Singapore). Some early decisions
predate any commit that captures them cleanly, so the date is approximate
and marked.

---

## ADR-001: Tigress sits alongside Qashier and Stripe rather than replacing them

**Status:** Accepted
**Date:** 2026-04-11 [date approximate — encoded in the initial scaffold]

**Context**
The venue already has Qashier as its point-of-sale and Stripe as its
billing system. Both are battle-tested products serving thousands of
businesses. Tigress is built by and for one venue. The temptation —
common in green-field projects — is to absorb adjacent concerns ("while
we're here, let's do POS too") so there's a single system to operate.

**Decision**
Tigress is **not** a POS and **not** a billing system. Qashier handles
the till. Stripe handles subscriptions. Tigress handles everything those
two don't: bookings, the floorplan, walk-ins, member lifecycle, staff
operations, competitions, and the social feed. Stripe enters as
webhooks only; Qashier doesn't enter the system at all.

**Consequences**
- Scope is bounded. Every feature can be evaluated against "does this
  belong in Tigress, or in one of the two anchor systems?"
- Stripe is the source of truth for billing state. The
  `customer.subscription.updated` webhook resets credits; the app never
  decides on its own whether someone is paid up.
- Reporting that needs Qashier sales data has to be built externally.
  Tigress has no view into the till and never will.
- Members see two systems of record (Stripe's customer portal, Tigress's
  profile page). There is no unified billing UI inside Tigress.
- The "operational hub" framing is doing real work: when a feature
  proposal blurs the line, we're forced to articulate which side of the
  line it sits on.

---

## ADR-002: Mock mode required from day one with full feature parity

**Status:** Accepted
**Date:** 2026-04-11 [date approximate — established in the initial scaffold]

**Context**
The conventional pattern is "build against a dev database; mock only
for tests if at all". That makes onboarding slow, makes development
brittle to schema drift, and turns "demo this to the venue owner"
into a deploy task.

**Decision**
Every data-layer function in `src/lib/data/` (and the equivalent in
each module) checks `isSupabaseConfigured()` and branches between a
real Postgres path and an in-memory mock path. Both paths must stay
in sync. New features are required to ship working in *both* modes;
this is enforced per session prompt.

**Consequences**
- Onboarding: clone, `npm install`, `npm run dev`, log in as a test
  account. No database setup required for anyone joining the project.
- Demos to the venue owner are zero-setup; the mock fixtures double
  as the "happy path" data set.
- CI runs against mock fixtures, which makes it deterministic and
  fast — but means the test suite doesn't catch RLS or
  schema-validation bugs that only manifest against live Postgres.
  Those are caught by the role-write matrix and RLS pattern tests, not
  by integration runs.
- **Negative:** every data-layer feature carries a double-implementation
  cost. Add a column, you change the mock fixture, the real query, the
  type, and the test. This is a recurring tax on velocity.
- **Negative:** divergence is silent. A data-layer function that's
  correct in mock and broken in real (or vice versa) won't fail any
  test until it ships. Audits routinely spot-check parity for new code.

---

## ADR-003: Competitions module designed as lift-out-able with boundary tests

**Status:** Accepted
**Date:** 2026-04-20 [Session 21, commit `d7e211b`]

**Context**
The competitions feature set — tournaments, leagues, ladders,
fixtures, standings, promotion/relegation — is conceptually
independent of "the venue management app". A future product could be
"a generic billiards competitions platform". If we build it tangled
into the host, that future is closed off.

**Decision**
`src/competitions/` is a self-contained module with **enforced**
boundary discipline:
- Outside files import from inside only via route pages, the nav
  entry, and test helpers.
- Inside files import from the host only via the Player adapter
  (`data/players.ts`), the audit wrapper (`audit.ts`), the events
  hook (`events.ts`), and a small set of stable shared primitives
  (Supabase env, timezone, types, format helpers).
- All audit events prefixed `comp.*`, all tables prefixed `comp_`.
- The boundary is enforced by `tests/competitions/boundary.test.ts`,
  which greps every TypeScript file and fails CI on a violation.

**Consequences**
- The Player adapter is the rewrite point if the module is ever
  extracted. Replacing it swaps Tigress's identity model for some
  other host's, and everything downstream works unchanged.
- All competitions work — schema, data layer, actions, components —
  obeys the rule. New integration points are explicit (you have to
  edit the test allow-list to add one).
- **Negative:** patterns that already exist in the host (formatting,
  date helpers, role checks) are sometimes duplicated rather than
  imported. This is the cost of the boundary; we accept it.
- **Negative:** new contributors get tripped up by the test failing on
  what looks like a "harmless import". The error message points at the
  boundary doc, but the friction is real.

---

## ADR-004: Scheduling and payroll host-folded; isolation would be artificial

**Status:** Accepted
**Date:** 2026-05-07 [Session 25, commit `9074c8b`]

**Context**
The competitions module's boundary discipline (ADR-003) was a success.
The natural reaction was to apply the same rule to scheduling and
payroll: another lift-out-able module. We considered it and rejected
it.

**Decision**
`src/scheduling/` (and `src/scheduling/payroll/` inside it) is
**host-folded**. No boundary test, free imports both ways with the
host, with a single soft rule: don't leak between `src/scheduling/`
and `src/competitions/` (those two modules don't know each other).

**Consequences**
- Scheduling reuses host primitives directly: the `staff` table for
  identity, the role hierarchy for authorization, the audit log, the
  Web Push subscription pipeline. No adapter ceremony.
- New scheduling features can use any host helper without thinking
  about it.
- Table prefixes (`schedule_*`, `schedule_payroll_*`) and audit
  prefixes (`schedule.*`, `payroll.*`) are kept as a courtesy: if a
  future maintainer ever decides to extract part of it, the seams are
  visible.
- **Negative:** if the future ever wants a standalone scheduling
  product, this decision has to be reversed and the boundary
  retrofitted. The bet is that future is unlikely enough not to pay
  for now.
- **Negative:** there's no mechanical guard against scheduling
  silently absorbing too much host concern. Discipline lives in code
  review.

---

## ADR-005: League configuration must be fully flexible from day one

**Status:** Accepted
**Date:** 2026-05-04 [Session 23, commit `589c479`]

**Context**
Real billiards leagues vary widely. Some are 8-ball doubles only,
some are 9-ball singles, some are team-of-six rotations. Points
schemes vary. Tiebreakers vary. The temptation is to ship the venue's
current format hard-coded and "make it configurable later".

**Decision**
League configuration is a JSON document on
`comp_competitions.league_config`, validated at create time. Session
23 ships the most common configuration as supported (single
round-robin, win=3/draw=1/loss=0, strict roster, two named
tiebreakers). Any unsupported feature throws
`LeagueConfigNotImplementedError(feature)` at config validation
*and* at standings computation. This is the explicit shape rather
than a quiet default.

**Consequences**
- The league engine doesn't lie. If a config asks for something the
  engine can't do, you get told immediately, not silently wrong
  standings.
- Adding a new config option is implementing it in two places (the
  validator and the standings computer), which forces honesty about
  the engine's actual capability.
- **Negative:** the ergonomic price of a JSON config column is non-zero
  — UIs need to know what's settable, and the migration path between
  config shapes has to be planned.
- The flexibility headroom turned out to matter immediately: S24a
  added schedule generation, S24b1 finished standings, S24b2 added
  promotion/relegation. Each rested on the configurability foundation.

---

## ADR-006: Atomic state changes via Postgres RPCs

**Status:** Accepted
**Date:** 2026-04-11 [Session 5, commit `1ac96ca` — first applied to credit operations]

**Context**
Tigress runs on Vercel functions, which are stateless and short-lived.
There is no application-level transaction manager that survives across
multiple Supabase calls. A naive "fetch row, decrement in JS, write
back" pattern races itself the moment two requests arrive concurrently.

**Decision**
Mutations that touch multiple rows or need row-level locking are
implemented as Postgres functions and called via Supabase's RPC
interface. Each function does its work in a single statement (or a
single explicit transaction with `FOR UPDATE` row locks where needed).
The application layer just calls the RPC and handles the result.

Examples currently in the schema:
- `deduct_credits`, `refund_credits` (credit operations, S5).
- `comp_set_fixture_participants` (atomic gala participant swap, S24a).
- `comp_finalize_division_promotions` (multi-row promotion/relegation
  apply, S24b2).
- `schedule_create_week`, `schedule_publish_week`,
  `schedule_unpublish_week`, `schedule_copy_from_previous_week`,
  `schedule_lock_clock_records`, `schedule_accept_swap`,
  `schedule_reverse_swap` (scheduling lifecycle, S25–S26).
- `schedule_payroll_lock_run`, `schedule_payroll_unlock_run`,
  `schedule_payroll_recompute_run` (payroll lifecycle, S27a).

**Consequences**
- Concurrent updates can't race each other. The credit decrement does
  the right thing under load, by construction.
- The RPC name is the mental anchor for "this is the atomic boundary".
  Reading the action layer, you can see exactly where database
  transactions begin and end.
- **Negative:** every RPC has to be tested twice — pure SQL behaviour
  in the migration tests (where they exist) and behaviour as called
  from the action layer in mock mode. Mock mode simulates the RPC
  semantics in-process; if mock and SQL drift, only real-mode usage
  catches it.
- **Negative:** RPCs accumulate. Schema migrations get longer. The
  upside is they're individually small and named.

---

## ADR-007: Defense-in-depth authorization (RLS + server-action authz + route guards)

**Status:** Accepted
**Date:** 2026-04-11 [Session 3, commit `6a82792` — first wired the three layers together]

**Context**
"Just put it behind RLS" is a single point of failure. So is "just
check the role in the action". Three independent layers means a
single bug in any one can't on its own expose data.

**Decision**
Every read and write goes through three checks:
1. **Route-group guards** (Next.js layouts): `(auth)/`, `(member)/`,
   `(staff)/`, `(owner)/`, `(community)/`.
2. **Server-action authorization**: explicit role check before any
   data call. Owner-only actions check for owner; manager+ for
   manager or owner; staff+ for staff/manager/owner.
3. **RLS policies** on every table, with the NULL-coalescence
   envelope (ADR-016) on every USING/WITH CHECK clause.

All three are required. None is sufficient alone.

**Consequences**
- A misconfigured RLS policy is caught by the action check. A
  misconfigured action is caught by RLS. A misconfigured route group
  is caught by both.
- The security tests assert the three layers agree:
  `tests/security/role-write-matrix.test.ts` checks action-layer
  expectations against RLS write policies;
  `tests/security/rls-pattern.test.ts` enforces the RLS rule itself.
- **Negative:** every new feature has three places to update. Forgetting
  one is a common mistake; the role-write matrix manifest is the
  mechanical guard, but it requires the manifest to be kept current.
- **Negative:** "why does this not work" debugging has three layers to
  search through. The error messages are usually distinguishable
  (route guard returns 403; RLS silently returns no rows; action
  returns `{ success: false, error }`), but the categorization isn't
  free.

---

## ADR-008: Mandatory four-step build verification before any commit

**Status:** Accepted
**Date:** 2026-05-04 [Session 24b1 — `tsc --noEmit` step added after the audit, commit `2084ec5` + `1712221`]

**Context**
For most of Phase 1 the verification gate was three steps: `next
build`, `next lint`, `vitest run`. The S24b1 audit caught two type
errors in test files that all three passed. Vitest transpiles via
esbuild without type-checking; `next build` only type-checks files in
the app's import graph; tests routinely escape both.

**Decision**
The mandatory pre-commit verification sequence is **four** steps,
all of which must pass:

```
npx tsc --noEmit
npm run build
npm run lint
npx vitest run
```

`tsc --noEmit` is non-negotiable, specifically because it's the only
step that catches type drift in test files.

**Consequences**
- Type errors in tests are caught before commit, not after merge.
- Total verification time is longer (about 3× a single-step run for a
  cold cache).
- The four-step gate is documented in `CLAUDE.md` so every Claude
  Code session reads it at startup.
- **Negative:** disciplined enforcement requires either a pre-commit
  hook or trust that the developer (or Claude) actually runs all
  four. We've chosen trust + the audit to catch slips.

---

## ADR-009: Mock/real parity as a hard requirement, enforced per session prompt

**Status:** Accepted
**Date:** 2026-04-11 [established in the initial scaffold; reinforced every session prompt]

**Context**
ADR-002 establishes mock mode. Without active enforcement, mock mode
silently rots: a new feature works in real mode (because the
developer tested it that way) and breaks in mock mode. By the time
someone notices, the mock data layer is half the codebase and
broken.

**Decision**
Every session prompt includes an explicit "mock/real parity"
requirement. Every audit checks that new data-layer functions have
both branches and that the mock fixtures cover the new shapes.
Failing this check is a critical finding, not a nit.

**Consequences**
- Mock mode stays usable end to end across phases. As of S27b-fix, the
  app boots, signs in, runs every feature including payroll runs and
  PDF generation, with zero infrastructure.
- The discipline forces clearer separation: data-layer functions
  whose mock branch is hard to write usually have a design problem
  (too much logic in the data layer, not enough in the action layer).
- **Negative:** the per-session ritual has overhead. If a session is
  small enough that no data-layer changes happen, the requirement is
  noise.

---

## ADR-010: Asia/Singapore timezone for all server-side date logic via shared utility

**Status:** Accepted
**Date:** 2026-04-11 [Session 6, commit `3c1cf1d` — SGT helpers introduced]

**Context**
The venue is in Singapore (UTC+8, no DST). Vercel functions run in
UTC. JavaScript's `new Date()` is local-time, which on a Vercel
function means UTC. "Today's bookings" computed naively returns
*UTC today*, which is up to 8 hours wrong from the venue's
perspective.

**Decision**
All date arithmetic that involves "venue time" — slot starts, day
boundaries, week starts, "today's checklists", payroll period
boundaries — goes through helpers in `src/lib/timezone.ts`. Raw
`new Date()` is allowed only at points where UTC is correct (e.g.,
recording an event timestamp). Direct `Date` arithmetic on venue-time
values is a bug.

**Consequences**
- Venue-day boundaries are correct regardless of where the function
  runs. Bookings, schedules, and payroll periods all line up with
  what the venue actually sees.
- The helper is the documented place for timezone logic. Any new
  date-boundary code points into it; reviewers can ask "did you go
  through `timezone.ts`?" as a single check.
- **Negative:** the helper has to handle every shape of date math the
  app needs. It has grown over time; new operations sometimes require
  extending the helper rather than dropping a one-liner.
- **Negative:** if Singapore ever adopts daylight saving (it won't),
  the helper has to know.

---

## ADR-011: Single-source-of-truth pattern for shared documents

**Status:** Accepted
**Date:** 2026-05-10 [Session 27b, commit `3e67ede`; clarified in S27b-fix `0772057`]

**Context**
A pay-run produces several artifacts: a PDF payslip, a JSON export, a
CSV bundle, and a UI summary on the staff payroll page. If each is
computed independently from the raw line items, they will eventually
disagree on rounding, field naming, or field presence. Members will
notice when their PDF says one thing and the staff app says another.

**Decision**
There is a single transformer — `payslip-transformer.ts` — that
takes raw line items + run metadata and produces a normalized payslip
shape. Every downstream surface (PDF, JSON, CSV, staff UI) consumes
that normalized shape. Numbers stay consistent across surfaces by
construction.

**Consequences**
- Adding a new surface (a new export format, a new page) doesn't risk
  divergence. You consume the transformer's output; you can't
  accidentally re-derive a number.
- Rounding rules live in one place. The CSV precision test (where
  "round-of-sum vs sum-of-rounded" once differed by a cent) has one
  thing to assert against, not four.
- **Negative:** the transformer's shape is now load-bearing. Changes
  ripple through every consumer. A versioned transformer might be
  needed if the shape ever changes incompatibly.
- The pattern generalizes. As of S27b-fix, payroll is the only place
  it's needed, but any future "shared document with multiple
  surfaces" should reach for it first.

---

## ADR-012: Migration ordering discipline; helper functions cannot reference tables before they exist

**Status:** Accepted
**Date:** 2026-04-11 [Session 9, commit `bea16ea`]

**Context**
Migration `001_initial_schema.sql` originally defined
`public.get_staff_role()` (which queries the `staff` table) before
`staff` was created. Postgres accepts the function definition with a
deferred reference, but the *RLS policies* that use the function
fail at policy-creation time because the function evaluates against
the not-yet-existent table during validation.

**Decision**
Within any migration file, ordering is: extensions → tables →
indexes → functions → policies → triggers → seed data. Functions
must not reference tables that aren't in scope. Policies must not
reference functions that aren't yet defined. The migration is
treated as a script that runs top to bottom; assume nothing exists
that hasn't been created above the current line.

Migrations are append-only. Bug-fix migrations get their own number.
A migration is never edited after it has shipped.

**Consequences**
- A clean Supabase project always succeeds on first apply.
- Bug-fix migrations are explicit and traceable
  (`015_s24a_fixups.sql`, `021_s26_fixes.sql`,
  `022_s27a_fixes.sql`, `023_s27a_fix_2.sql`).
- **Negative:** the migration file count grows monotonically. As of
  Session 28, we're at 24. There's no "compact the history" step,
  and we don't want one — the trail is the audit log.

---

## ADR-013: Deliberate-violation verification as standard audit practice

**Status:** Accepted
**Date:** 2026-05-04 [Session 24b1-fix, commit `1712221` — formalized after the RLS pattern guard]

**Context**
A test that's supposed to catch a class of bug only earns trust if
you can show it actually fails when the bug is reintroduced. A test
that "always passes" is functionally untested. Three sessions in a
row shipped tests that were later discovered to be passing
regardless of whether the underlying check was working — see
PATTERNS.md for the receipts.

**Decision**
For any institutional-memory work — security guards, atomicity
tests, regression spies — the audit step **must** include a
deliberate-violation pass:
1. Revert the fix you just landed.
2. Run the test.
3. Confirm it fails — and fails for the right reason.
4. Restore the fix.

If the test passes when the fix is reverted, the test is wrong.
The fix doesn't ship until the test is genuinely engaging.

**Consequences**
- Several near-misses caught: the RLS NULL-coalescence guard
  (S26 critical leak), the CSV precision test (round-of-sum vs
  sum-of-rounded discrepancy), the `unlockRun` rollback test
  (Proxy injection point was wrong; throw fired before any
  mutation, so the rollback path wasn't exercised).
- Cultural shift: "did you deliberate-violate it?" is a routine
  audit question.
- **Negative:** audit time roughly doubles for security-critical
  changes. The deliberate-violation step itself is fast, but the
  required care around what to revert and what to leave in place
  takes time to think through.

---

## ADR-014: Session sizing — split into S{N}a / S{N}b is preferred over heroic single sessions

**Status:** Accepted
**Date:** 2026-05-04 [Session 24a, commit `a02a4e6` — first deliberate split]

**Context**
Some session prompts are large. The tempting move is to keep them
single ("get it done in one shot") to avoid the overhead of writing
two prompts and two commits. The reality is that long sessions
produce sprawling diffs, the audit becomes harder, and the rollback
cost of a problem grows with diff size.

**Decision**
When a session prompt feels heavy, split it. Naming convention is
`S{N}a` and `S{N}b` (or further: `S24b1`, `S24b2`). Each part lands
in its own commit with its own audit. Findings from the first part
fold into the second part's prompt.

History so far: S24a / S24b (S24b further split into b1 and b2),
S27a / S27b. Plus three intervening fix-ups: S24a-fix, S24b1-fix,
S24b2-fix; and S27a-fix, S27a-fix-2, S27b-fix.

Claude Chat correctly identified that S27b should also be split;
Claude Code declined and the session landed cleanly anyway. The
option was correctly identified — declining it was the right call
for that specific session, but the next time the option arises, it
should still be the default.

**Consequences**
- Audits are smaller and the audit-fix loop is tighter.
- Each commit is reviewable in isolation.
- The git log is more granular, which makes session-to-commit
  mapping explicit.
- **Negative:** prompt-writing time approximately doubles for a
  split session.
- **Negative:** more commits means more "what changed" surface area
  for someone reading history later. We accept this; small commits
  are easier to read than one massive one.

---

## ADR-015: Audit workflow runs in chat, not in CI

**Status:** Accepted
**Date:** 2026-04-11 [Session 8 — workflow established, commit `4bf621d`]

**Context**
Conventional engineering practice would put audit-style checks in
CI (linters, security scanners, custom rules). Tigress instead runs
audits as a chat conversation between RC and Claude Chat after each
Claude Code session lands.

**Decision**
After every Claude Code commit, an audit runs in chat:
1. `git log --oneline -15` to see what landed.
2. `git diff [prev]..[head] --stat` for shape.
3. Targeted per-file diffs by domain (data layer, actions,
   components separately).
4. Spot-check claims against code.
5. Deliberate-violation verification for institutional-memory work
   (ADR-013).

Findings are classified critical / medium / lower / observation.
Critical and medium block; lower and observation can defer to a
fix-up or the next session.

CI keeps doing what CI is good at — running the four-step
verification gate, surfacing test failures — but the open-ended
"is this work right?" question stays in chat.

**Consequences**
- Audits catch things CI can't: design-level concerns, reasoning
  errors, missing tests, divergence from prior decisions.
- The audit is collaborative; it produces fix-up prompts as a
  byproduct.
- The audit history is not in git — it lives in chat transcripts.
  When something needs to be durable, it migrates to docs (CLAUDE.md
  patterns, this DECISIONS.md file, PATTERNS.md).
- **Negative:** audit quality is human-dependent. CI is uniform; chat
  audits vary by session. The fix-up loop catches gaps eventually.
- **Negative:** there's no "audit pass" indicator on commits. Trust
  in the codebase comes from the audit-fix discipline, not from a
  badge.

---

## ADR-016: RLS NULL-coalescence rule — every USING/WITH CHECK OR-branch must reference get_staff_role()

**Status:** Accepted
**Date:** 2026-05-09 [Session 26, commit `273eb01`; strengthened in S27a-fix-2 commit `7ecd9a9`]

**Context**
Two consecutive sessions (S25, S26) shipped RLS policies with the
same bug: a USING clause of the form
`(public.get_staff_role() = 'manager') OR (kind = 'giveaway')`. For
a non-staff caller, `get_staff_role()` returns NULL — `NULL = 'manager'`
is NULL — `NULL OR (kind = 'giveaway')` is `(kind = 'giveaway')`,
which evaluates TRUE for any matching row. The policy intended to
guard manager-only access; it instead leaked rows to anyone.

**Decision**
Every CREATE POLICY USING/WITH CHECK clause must reference
`public.get_staff_role()` on **every top-level OR-branch**. A bare
equality on its own is forbidden. The check is mechanical, enforced
by `tests/security/rls-pattern.test.ts`, which tokenizes each clause
and tests every operand against the regex
`/public\.get_staff_role\s*\(/i`.

Manager-only branches that already use
`public.get_staff_role() IN ('manager', 'owner')` satisfy the rule
trivially. Member-self-access branches that use `auth.uid()` need
to be wrapped in the staff-role envelope OR added to the
`rls-allowlist.json` exemptions with a documented reason.

Initial S26 fix used a regex that passed if `get_staff_role()`
appeared *anywhere* in the body, which still allows a leaky OR-branch
elsewhere in the same clause. The S27a-fix-2 strengthening is the
boolean-aware OR-branch parser.

**Consequences**
- The class of bug is mechanically prevented going forward. New
  policies are forced to either obey the rule or be added to the
  allow-list with a written justification.
- The allow-list is itself a documentation artifact — every entry
  is "this is why this exception exists".
- **Negative:** the test is brittle to formatting changes. A policy
  body refactor that splits a one-line OR into multiple lines can
  trigger a false positive if the parser doesn't track parens
  carefully. The S27a-fix-2 tokenizer respects paren depth and
  string literals to mitigate this.
- **Negative:** allow-list growth is a smell. As of Session 28, the
  list has 72 entries — most are pre-rule policies grandfathered in,
  not new exceptions.

---

## ADR-017: Hand-written PWA service worker over `next-pwa` / `workbox`

**Status:** Accepted
**Date:** 2026-04-11 [Session 14, commit `d074491`]

**Context**
The standard PWA story for Next.js is `next-pwa`, which wraps
Workbox. Workbox auto-generates a precache manifest from the build
output and handles a lot of edge cases. The cost is several hundred
KB of dependency, build-time codegen that's hard to inspect, and a
strategy abstraction that's harder to reason about than the
underlying Cache API.

**Decision**
The service worker is hand-written. One file:
`public/sw.js`. Strategy is explicit: network-first for navigation,
cache-first for static assets, passthrough for everything else. The
precache list is a constant in the file. Cache versioning is a
manual constant the maintainer bumps when the precache or offline
shell changes.

**Consequences**
- Total control over cache strategy. The "never cache Next.js
  bundles" rule is enforced by the strategy directly, not by
  hoping a config option does the right thing. Hash-named bundles
  must passthrough or PWA users get stranded on stale JS after
  deploy.
- The mental model is one file. New maintainers can read it in
  five minutes.
- No build-time codegen. The SW that ships is the SW in the repo.
- **Negative:** no automatic precaching of the Next.js build
  manifest. The precache list is a constant; if a new static asset
  is added, the precache list needs an update, otherwise it just
  goes through the network on first load.
- **Negative:** Workbox handles a lot of edge cases (range
  requests, Background Sync, Push event normalization across
  browsers). Hand-writing means we handle the cases we hit and
  ignore the ones we don't.

---

## ADR-018: Self-hosted Web Push via VAPID + `web-push` over third-party push services

**Status:** Accepted
**Date:** 2026-04-12 [Session 15, commit `4633d64`]

**Context**
The conventional choices for push notifications are OneSignal,
Firebase Cloud Messaging, or one of several smaller vendors. They
handle delivery, retries, segmentation, and analytics. The cost is
per-message pricing, vendor lock-in, and routing every notification
content through a third party.

**Decision**
Push delivery is self-hosted. VAPID keys generated locally via
`scripts/generate-vapid-keys.js`, delivery via the `web-push` npm
package running on Vercel functions. No third-party service in the
data path.

**Consequences**
- No per-message cost. The venue's push volume could grow 100×
  before infrastructure costs become noticeable.
- No vendor lock-in. Swapping `web-push` for another VAPID
  implementation is mechanical.
- No privacy delegation. Notification payloads never leave Tigress's
  infrastructure.
- **Negative:** delivery monitoring is on us. There's no vendor
  dashboard showing "you sent N pushes; X% delivered, Y% clicked".
  We log failures and handle 404/410 cleanup, but anything richer is
  build-it-ourselves.
- **Negative:** subscription cleanup is the app's responsibility.
  Dead subscriptions stay in `push_subscriptions` until a delivery
  attempt 410s and the cleanup path runs. A vendor would garbage-
  collect for us.
- **Negative:** segmentation, scheduling, and A/B-testing of
  notifications are out of scope. The current pipeline does
  "deliver this payload to this user, fire-and-forget"; anything
  else would have to be built.

---

## ADR-019: `server-only` import as the data-layer / client-component boundary

**Status:** Accepted
**Date:** 2026-04-11 [Session 4 — established with the data layer, commit `9ef5ecd`]

**Context**
Next.js App Router lets components be either server or client.
Data-layer modules import secrets (Supabase service role key,
Stripe webhook secret) and directly query the database. If a client
component accidentally imports a data-layer module, those secrets
get bundled into the client JS — a security incident.

**Decision**
Every file under `src/lib/data/` and the equivalent module data
directories starts with:

```ts
import "server-only";
```

The `server-only` package throws at *build time* if the module is
imported into a client component. The error points directly at the
import; the bundle never gets generated.

**Consequences**
- Mechanical, hard-to-bypass guard against the worst-case mistake.
  An accidental client import becomes a build failure, not a
  shipped vulnerability.
- The boundary is visible in source. Reading a file's first line
  tells you whether it can be imported from a client.
- **Negative:** the line is easy to forget when adding a new data
  file. Code review catches it; a pre-commit grep would catch it
  more reliably (not yet automated).
- **Negative:** server actions and route handlers have to be the
  bridge between client components and the data layer. This is
  fine architecturally, but it's a constraint to remember.
