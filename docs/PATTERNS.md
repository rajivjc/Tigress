# Patterns

A pattern documented without the bug that motivated it is half a
pattern. Each entry below pairs the rule with the failure story that
forced it into the codebase. File paths and test names are real and
current as of Session 28.

The patterns are ordered loosely by how much trouble they save.

---

## 1. Mock/real path parity

**Problem.** Tigress runs end to end without Supabase (ADR-002).
Every data-layer function carries two implementations: a mock branch
that mutates in-memory fixtures and a real branch that talks to
Postgres. Without active enforcement, the two paths drift and one
side silently breaks.

**How it works.**
- Every file in `src/lib/data/` (and the per-module `data/`
  directories) imports `"server-only"` and exports functions that
  internally branch:

  ```ts
  if (!isSupabaseConfigured()) {
    // mock branch — mutate the in-memory array
    return ...;
  }
  // real branch — Supabase client
  ```

- Mock fixtures live in `src/lib/data/mock-data.ts` (host),
  `src/competitions/data/mock-data.ts`,
  `src/scheduling/data/mock-data.ts`, and
  `src/scheduling/payroll/data/mock-data.ts`.
- Tests run exclusively against the mock branch (no live Supabase
  in CI).

**Where it's enforced.**
- Per-session prompt requirement: "mock/real parity is a hard
  requirement". Audit failure if violated.
- `tests/data/`, `tests/competitions/data/`, `tests/scheduling/data/`,
  `tests/scheduling/payroll/data/` exercise the mock branches
  directly.
- The shape of `__resetMock*()` helpers exported from each mock data
  file gives tests a clean reset between runs.

**Why it exists.** Onboarding without database setup is the headline
benefit, but the structural benefit is bigger: mock mode forces every
data-layer function to have a clear input/output contract. Functions
whose mock branch is hard to write usually have too much logic in the
data layer (it should move up to the action). The discipline shapes
the architecture.

---

## 2. Module boundary tests with grep + deliberate violation

**Problem.** Once a module is "isolated by convention" but has no
mechanical guard, a tired afternoon produces an import that breaks
the convention. Six months later, the module is no longer
extractable. We almost did this with the competitions module twice.

**How it works.**
`tests/competitions/boundary.test.ts` (~190 lines) walks every `.ts`
and `.tsx` file under `src/`, parses imports with a regex, and
asserts two rules:

1. `outside files do not import from src/competitions/ unless
   whitelisted` — only route pages, the `StaffSidebar` nav entry,
   and `reset-mock-data.ts` may import from inside the module.
2. `inside files do not import host code unless whitelisted` —
   files inside the module may only import from a closed set of
   stable host primitives (`@/lib/supabase/*`, `@/lib/timezone`,
   `@/lib/types`, `@/lib/format`, Next.js modules, `server-only`).
   Three adapter files
   (`src/competitions/data/players.ts`, `audit.ts`, `events.ts`) are
   permitted to import a slightly broader set
   (`@/lib/data/members`, `@/lib/data/staff`, `@/lib/auth/mock-users`,
   `@/lib/data/mock-data`).

The allow-lists are encoded in the test file itself, not in a side
JSON. Adding an integration point requires editing the test, which
forces a thinking step.

**Where it's enforced.**
- `tests/competitions/boundary.test.ts:122–148` — the two test
  cases.
- Runs on every CI invocation as part of the standard vitest pass.

**Failure story.** Across S22 and S23, two separate near-violations
were caught only because the boundary test failed. One was a
prepared diff that imported `@/lib/data/auth` into a competitions
data file (would have skipped the Player adapter); the other was a
host component reaching into `src/competitions/lib/standings.ts`
directly to render a leaderboard widget (would have welded the host
to module internals). Both cases would have looked harmless in
review. The grep test is what closed the loop.

**Deliberate violation.** When you change the boundary test itself
or the allow-list, the audit step is: revert your change, write a
new file that violates the rule you intended to enforce, run the
test, confirm it fails for the right reason. If the test passes,
the rule isn't actually being enforced.

---

## 3. Proxy-on-mutation-target for atomicity tests

**Problem.** Mock-mode atomicity tests verify that when a multi-step
mutation fails partway through, the rollback restores prior state.
The original pattern was to spy on the *first* mutation and
`mockImplementationOnce(throw)`. This passes whether the rollback
exists or not — because the throw fires *before any mutation has
happened*, there is nothing to roll back, and the test trivially
passes.

**How it works.**
The fix is to identify a mutation that should *succeed* and a
*subsequent* mutation that should *fail*, then wrap the target object
in a Proxy whose `set` trap throws only on the second write. The
first mutation lands; the second throws; the rollback path is
genuinely engaged.

Canonical example, from
`tests/scheduling/payroll/data/reconciliation.test.ts:353`:

```ts
it("rolls back BOTH the splice AND the run mutation when run-row
    write fails (Proxy mutation-target injection)", async () => {
  // ... setup ...
  let proxyApplied = false;
  let firstWriteFailed = false;
  findSpy.mockImplementation(function (this, ...args) {
    const result = Array.prototype.find.apply(MOCK_TABLE, args);
    if (!result || proxyApplied) return result;
    proxyApplied = true;
    return new Proxy(result, {
      set(target, key, value) {
        if (key === "unlocked_at" && !firstWriteFailed) {
          firstWriteFailed = true;
          throw new Error("simulated DB failure on run mutation");
        }
        return Reflect.set(target, key, value);
      },
    });
  });
  // ... call unlockRun, expect failure, assert rollback restored prior state ...
});
```

The `firstWriteFailed` guard matters: the rollback itself writes
to the same field (to restore the snapshot), and re-throwing on
that write would either kill the rollback or surface a different
error than the test asserts.

**Where it's enforced.**
- `tests/scheduling/payroll/data/reconciliation.test.ts:353`
  (`unlockRun` Proxy injection).
- `tests/scheduling/payroll/data/reconciliation.test.ts:216,335`
  (related throw-injection tests for adjacent mutations).
- The pattern is documented inside `CLAUDE.md` (the file Claude Code
  reads at startup) so future sessions reach for it by default.

**Failure story.** Three sessions in a row shipped atomicity tests
that didn't exercise their rollback paths because the throw fired on
the first mutation:

- **S27a Finding 4** — atomicity test for a payroll mutation passed
  whether the rollback was present or not.
- **S27a-fix-2 Finding 12** — same pattern, different test.
- **S27b Finding 17** — `unlockRun` rollback test. The throw was
  injected at the function-call boundary; the rollback could be
  commented out entirely and the test still passed.

The S27b-fix audit deliberately commented out the rollback,
re-ran the test, watched it pass, and only then identified the
Proxy-on-mutation-target pattern as the canonical fix. The
deliberate-violation step (Pattern 7) was the only reason this got
caught.

---

## 4. RLS pattern guard with boolean-aware OR-branch parsing

**Problem.** Postgres RLS policies of the form
`(get_staff_role() = 'manager') OR (kind = 'giveaway')` have a
subtle leak: for a non-staff caller, `get_staff_role()` returns
NULL, `NULL = 'manager'` is NULL, and `NULL OR (kind = 'giveaway')`
evaluates as `(kind = 'giveaway')` — which is TRUE for any matching
row. The policy intended to be manager-only; it was actually open
to anyone.

**How it works.**
`tests/security/rls-pattern.test.ts:225` walks every CREATE POLICY
in `supabase/migrations/`, extracts the USING and WITH CHECK
clause bodies, and runs them through `splitTopLevelOr()` (lines
162–212). The splitter:
- Tracks paren depth so `OR`s inside parenthesized sub-expressions
  don't count as top-level.
- Tracks string literal state so `OR` inside `'foo OR bar'`
  doesn't count.
- Splits the body on top-level `OR` (case-insensitive, word-bounded)
  and returns trimmed operands.

Each operand is then tested:

```ts
if (!/public\.get_staff_role\s*\(/i.test(operand)) {
  // failure — this OR-branch leaks
}
```

Exemptions live in `tests/security/rls-allowlist.json`
(67 entries as of Session 28; the `_comment` field documents that
adding new entries is reserved for the legacy backfill — new
policies must obey the rule). Each entry carries a `file`, `policy`,
and `reason`.

**Where it's enforced.**
- `tests/security/rls-pattern.test.ts:225` (the assertion test).
- `tests/security/rls-pattern.test.ts:162–212` (the boolean-aware
  splitter).
- `tests/security/rls-allowlist.json` (exemptions with reasons).

**Failure story.** Two consecutive sessions shipped policies with
the bare-equality OR-branch:

- **S25** — a new schedule-related policy.
- **S26** — a `schedule_shift_change_requests` SELECT policy where
  the giveaway branch was a bare equality. RC's audit caught it
  because the route-group guard wasn't tight enough either; the
  fix-up rolled into S27a.

The S26 fix introduced a regex that passed if `get_staff_role()`
appeared *anywhere* in the body. That regex would have caught the
S26 leak (the leaky policy didn't reference the function at all),
but it would *not* have caught a hypothetical
`(get_staff_role() = 'manager') OR (kind = 'giveaway')` because
the function appears in the body, just not on every branch.

S27a-fix-2 rewrote the check as the boolean-aware OR-branch parser
described above. The strengthening was prompted directly by reading
the original regex and asking "what shape of leak would this still
miss?"

**Deliberate violation.** Add a fake policy to a migration with one
clean OR-branch and one bare-equality OR-branch. Run the test.
Confirm it fails on the bare-equality branch. Then test a policy
with `get_staff_role()` only on one side of the OR — confirm the
test still fails. (The pre-S27a-fix-2 regex would have passed
this case.) Remove the fake policy.

---

## 5. Role-write matrix manifest test

**Problem.** Server actions and RLS policies must agree on who can
write what. A drift — for example, the action allows manager+ but
the policy still requires owner — produces a silent class of bug:
mock mode (no RLS) lets the call through, real mode (RLS engaged)
silently rejects.

**How it works.**
`tests/security/role-write-matrix.json` declares the expected writer
roles for each table covered:

```json
{
  "schedule_payroll_runs": {
    "writers": {
      "default": ["manager", "owner"],
      "lock_transitions": ["owner"]
    },
    "lock_state_column": "status",
    "lock_state_values": ["locked"]
  }
}
```

`tests/security/role-write-matrix.test.ts:152–161` parses every
INSERT, UPDATE, DELETE, and FOR ALL policy on the declared tables,
extracts the role set the policy permits, and asserts:

1. Every write policy on a declared table is covered by the
   manifest.
2. The union of allowed roles in WRITE policies matches the
   manifest's expected set.

For tables with status-aware splits (`schedule_payroll_runs` —
runs in `locked` state are owner-only for transitions), the test
distinguishes `writers.default` from `writers.lock_transitions` by
inspecting whether the policy body references the
`lock_state_column` and `lock_state_values`.

**Where it's enforced.**
- `tests/security/role-write-matrix.test.ts:152` (`describe`).
- `tests/security/role-write-matrix.test.ts:161` — the union-of-
  roles assertion.
- `tests/security/role-write-matrix.json` — the manifest.

**Failure story.** This guard was added in S25 explicitly because
scheduling introduced enough new tables that "did I update the
action and the policy in sync?" became a bookkeeping problem. It
caught a payroll table in S27a where a policy had been added before
the manifest entry; the test failure pointed directly at the
mismatch and the fix was a one-line manifest update.

The lock-state-aware split was added in S27a alongside payroll's
`status: 'locked'` semantics. Without it, the test couldn't model
the intentional design where `manager` can update a `draft` run
but only `owner` can transition through `locked`.

---

## 6. N+1 spy regression guards

**Problem.** A function that batches queries today can quietly
regress to per-row queries tomorrow, especially during refactors.
The runtime hit is invisible in tests (mock fixtures are tiny);
production sees the slowdown only at scale.

**How it works.**
Wrap the per-row function in a vitest spy and assert it was *never*
called. The batched function is the only acceptable call path.

Canonical example, from
`tests/scheduling/payroll/actions/export.test.ts:527`:

```ts
it("uses one batched fetch — never calls the per-run
    listLineItemsForRun", async () => {
  // ... setup with 3 runs each with line items ...
  const perRunSpy = vi.spyOn(lineItemsModule, "listLineItemsForRun");
  const batchedSpy = vi.spyOn(lineItemsModule, "listLineItemsForRuns");

  const r = await getStaffPayslipsSummaryAction();

  expect(perRunSpy).not.toHaveBeenCalled();    // line 579
  expect(batchedSpy).toHaveBeenCalledOnce();
  // ...
  perRunSpy.mockRestore();
});
```

A future maintainer who refactors `getStaffPayslipsSummaryAction`
into a per-run loop breaks this test immediately. The test
description names the regression by its symptom; the diff-time
signal is impossible to ignore.

**Where it's enforced.**
- `tests/scheduling/payroll/actions/export.test.ts:527`
  (`getStaffPayslipsSummaryAction` — primary example).
- The pattern is generalizable: any time you replace an N+1 call
  with a batched call, add a spy guard.

**Failure story.** S27b shipped `getStaffPayslipsSummaryAction` as
the staff-side payslip listing. The first cut iterated runs and
called `listLineItemsForRun` per run — fine for a one-month staff
member, untenable for a long-tenured one. The audit (S27b-fix
Finding 18) flagged the N+1 and added the batched
`listLineItemsForRuns` plus this spy guard. Without the guard, a
future "let me simplify this loop" refactor would silently
reintroduce the N+1.

---

## 7. Deliberate-violation verification

**Problem.** A test that passes once is not necessarily a test that
catches the bug it claims to catch. The only way to know is to
*reintroduce* the bug and watch the test fail.

**How it works.**
Whenever an audit involves an institutional-memory check (a
security guard, an atomicity test, a regression spy), the audit
step includes:

1. Revert the fix.
2. Run the test.
3. Confirm it fails — and fails for the right reason (read the
   error message).
4. Restore the fix.

If the test passes when the fix is reverted, the test is wrong and
the fix doesn't ship until the test is fixed.

**Where it's enforced.**
- ADR-013 codifies this as standard audit practice.
- `CLAUDE.md` references the discipline in the "Testing patterns"
  section so each Claude Code session reads it at startup.

**Failure stories (three known catches).**

- **S26 critical RLS leak.** The S25 RLS policy with a leaky
  OR-branch was added with a guard test that didn't actually parse
  OR-branches. RC's audit deliberately injected a leaky policy,
  watched the test pass, and concluded the test was the wrong
  shape. This led to the S27a-fix-2 boolean-aware parser (Pattern 4).
- **CSV precision test (round-of-sum vs sum-of-rounded).** The
  payslip CSV test for gross/net amounts initially used three line
  items at `0.025` each. JavaScript's `Math.round(2.5) = 3`, so
  individually rounding gives `0.03 × 3 = 0.09`. Round-of-sum is
  `Math.round(7.5) = 8 → 0.08`. The original test used round amounts
  that produced the same answer either way — the test would have
  passed if the transformer accidentally implemented sum-of-rounded.
  S27a-fix-2 rewrote the test to use inputs where the two paths
  diverge (see `tests/scheduling/payroll/lib/csv.test.ts:141`). The
  test description literally says "uses inputs that diverge".
- **`unlockRun` rollback test (Proxy injection point was wrong).**
  The S27b atomicity test for `unlockRun` injected the throw at the
  function-call boundary. Reverting the rollback code, the test
  still passed — because the throw fired before any mutation
  happened, there was nothing to roll back. S27b-fix introduced
  the Proxy-on-mutation-target pattern (Pattern 3).

The pattern earns its keep on these three alone. Every audit that
covers institutional-memory work is now expected to include a
deliberate-violation pass.

---

## 8. Atomic state via Postgres RPC

**Problem.** Tigress runs on stateless Vercel functions. There is
no application-level transaction manager that survives multiple
Supabase calls. A naive "fetch row, update in JS, write back"
races the moment two requests arrive at once.

**How it works.**
Multi-row or row-locked mutations are pushed into Postgres
functions and called via Supabase's RPC interface. Each function
either runs in a single statement or wraps its work in an explicit
transaction with `FOR UPDATE` row locks. The application calls the
RPC and handles the result; the database is the transaction
boundary.

**Where it's enforced.** RPCs currently in the schema:

| RPC | Migration | Purpose |
|---|---|---|
| `deduct_credits` | 002 | Atomic credit decrement with row lock |
| `refund_credits` | 002 | Atomic credit increment on cancel |
| `comp_set_fixture_participants` | 015 | Multi-row gala participant swap |
| `comp_finalize_division_promotions` | 017 | Multi-row promotion/relegation apply |
| `schedule_create_week` | 019 | Week creation with associated shifts |
| `schedule_publish_week` | 018 | Week status transition + publish stamp |
| `schedule_unpublish_week` | 018 | Reverse of publish |
| `schedule_copy_from_previous_week` | 019 | Bulk copy of shifts to a new week |
| `schedule_lock_clock_records` | 019 | Bulk lock for payroll inclusion |
| `schedule_accept_swap` | 019 | Swap shift assignments atomically |
| `schedule_reverse_swap` | 021 | Reverse a swap (S26 critical fix) |
| `schedule_payroll_lock_run` | 020 (replaced 022) | Run state transition + reconciliation snapshot |
| `schedule_payroll_unlock_run` | 020 (replaced 022) | Reverse of lock |
| `schedule_payroll_recompute_run` | 020 | Idempotent engine re-run |

**Failure story.** The first place this pattern was needed was
credit operations in S5. Members were able, in a quick double-tap
on the booking confirm button, to deduct one credit twice without
the second call seeing the first's effect. Moving to a Postgres
function with `SELECT ... FOR UPDATE` locked the credit row and
serialized the decrement. The pattern then became the default
shape for any state transition that touches more than one row.

The S26 critical 1 finding was specifically that
`schedule_reverse_swap` did *not* originally exist as an RPC — the
swap-reversal flow updated `schedule_shifts.user_id` and the
request status in two separate Supabase calls. A failure between
the two left the system in a half-reverted state. Migration 021
added the RPC, and S27a folded the action layer's call site over
to it.

---

## 9. Pure-function test isolation

**Problem.** Tests that need infrastructure (DB, network, time)
are slow, flaky, and hard to debug. The slow/flaky cost compounds
over hundreds of tests.

**How it works.**
Every algorithmic concern is extracted into a pure library
(`*/lib/*.ts`) with no I/O, no global state, no time dependency
(or explicit time injection). Tests for the lib then run as pure
function tests: deterministic, in-process, sub-millisecond.

**Where it's enforced.**
Library directories and their test counterparts:

| Library | Test |
|---|---|
| `src/lib/timezone.ts`, `src/lib/format.ts`, `src/lib/youtube.ts` | `tests/lib/{timezone,format,youtube}.test.ts` |
| `src/lib/pwa/install-banner.ts` | `tests/pwa/install-banner.test.ts` |
| `src/competitions/lib/bracket.ts` | `tests/competitions/lib/bracket.test.ts` |
| `src/competitions/lib/promotion-planner.ts` | `tests/competitions/lib/promotion-planner.test.ts` |
| `src/competitions/lib/schedule.ts` | `tests/competitions/lib/schedule.test.ts` |
| `src/competitions/lib/standings.ts` | `tests/competitions/lib/standings.test.ts` |
| `src/scheduling/lib/{coverage,materialize,availability-check,attendance-state,clock-rounding,swap-eligibility}.ts` | `tests/scheduling/lib/*.test.ts` |
| `src/scheduling/payroll/lib/{rate-resolution,overtime-classification,line-item-aggregation,payslip-transformer,payslip-pdf,csv,engine}.ts` | `tests/scheduling/payroll/lib/*.test.ts` |

About 250 of the 1173 tests are pure-lib tests. The full suite
runs in ~12 seconds wall-clock.

**Failure story.** The competitions standings engine (S23/S24b1)
was the test case for this pattern. The first cut had standings
computation tangled with data-layer fetches. Tests had to set up
mock fixtures, run the action, and read back the result.
Refactoring `computeStandings(input) → StandingsRow[]` into a pure
function with explicit input shape moved standings into the lib
directory; the tests became "given this input, expect this output"
and ran 100× faster. The same pattern then drove the bracket
generator, promotion planner, and schedule generator — all pure,
all sub-millisecond per test.

---

## 10. Single-source-of-truth transformer

**Problem.** A pay run is read by four surfaces: the staff payroll
PDF, the JSON export, the CSV bundle, and the staff app summary.
If each surface re-derives totals from raw line items, they
eventually disagree on rounding, field names, or omissions.

**How it works.**
One transformer — `src/scheduling/payroll/lib/payslip-transformer.ts`
— takes raw line items + run metadata and returns a normalized
payslip shape. PDF, JSON, CSV, and UI all consume that shape; none
goes back to the raw line items.

**Where it's enforced.**
- `tests/scheduling/payroll/lib/payslip-transformer.test.ts`
  exercises the transformer.
- Each downstream surface has its own test
  (`tests/scheduling/payroll/lib/payslip-pdf.test.ts`,
  `tests/scheduling/payroll/lib/csv.test.ts`,
  `tests/scheduling/payroll/actions/export.test.ts`) and they all
  consume the transformer's output, not the raw inputs.

**Failure story.** S27b's first cut had the staff UI summary derive
totals on its own (sum of line items, divided into categories). The
audit caught a `0.01` divergence between the UI summary and the PDF
on the same pay run — the PDF used the transformer; the UI didn't.
S27b-fix routed the UI through the transformer too. The CSV
precision test (Pattern 7's second story) is a downstream
consequence: with a single transformer, there's one rounding rule
to assert against, not four.

---

## 11. Fire-and-forget side effects

**Problem.** A push notification, an audit log entry, or a webhook
fanout failure must never break the originating business operation.
A booking is more important than the push that confirms it. An
audit row is nice to have; it must never block the action it
records.

**How it works.**
- Side effects are wrapped in try/catch. The catch logs and
  swallows. The primary operation returns success.
- Push delivery (`sendPushToMember`, `sendPushToStaff`, etc. in
  `src/lib/push/send.ts`) is fire-and-forget. 404/410 responses
  trigger a cleanup of the dead subscription as a side effect of
  the next attempt.
- Audit emissions (`writeCompAuditLog`, scheduling and payroll
  audit helpers) similarly never throw to the caller.

**Where it's enforced.**
- `src/lib/push/send.ts` — try/catch around every `web-push.sendNotification`
  call.
- `src/competitions/audit.ts`, `src/scheduling/audit.ts`,
  `src/scheduling/payroll/audit.ts` — try/catch wrappers; failures
  are logged but never thrown.
- Tests verify that a forced push failure doesn't change the
  action's return value (e.g., `tests/actions/posts.test.ts` for
  the social feed).

**Failure story (counter-pattern caught in S24b1-fix).** Audit
emission belongs at action transition points, *not* during reads. A
data-layer standings *loader* in S24b1 emitted an audit event every
time standings were viewed. This was wrong on three levels:
- It made every standings load mutate the audit log (read-side
  writes are a footgun for caching, replication, and concurrency).
- The audit table grew unbounded with low-value reads.
- A failure in audit writing during a read would have been
  swallowed, but the *time* spent attempting it was on the read
  path.

S24b1-fix moved audit emission to action layer transitions
(competition created, fixture completed, etc.) where the write was
intentional and the failure mode (logged-and-swallowed) was
acceptable. The pattern guidance: side-effecting reads are a smell;
audit writes belong where state intentionally changes.

---

## 12. Template → Instance lazy materialization

**Problem.** Daily checklists need a per-date instance for staff to
tick off. Materializing every day's checklists in advance via cron
adds a cron job for a problem that doesn't need one; materializing
on-demand during the read solves it without infrastructure.

**How it works.**
Manager defines a template (`checklist_templates` +
`checklist_template_items`). Per-date instances
(`checklist_instances` + `checklist_instance_items`) materialize
lazily on first staff access of `/checklists` for that date.

Race-safety: `UNIQUE(template_id, date)` on `checklist_instances`
plus an `ON CONFLICT DO NOTHING` upsert means concurrent first-
accesses can't double-create. Whoever loses the race re-fetches and
finds the row.

Items are *copied* from the template at instance creation time
(label + description). Editing a template tomorrow doesn't rewrite
yesterday's record. The `template_item_id` foreign key is preserved
for traceability but `ON DELETE SET NULL` so removing a template
item doesn't break historical instances.

**Where it's enforced.**
- `src/lib/data/checklists.ts` — `getChecklistsForDate(date)` does
  the lazy create.
- `supabase/migrations/008_checklists.sql` — schema with the
  `UNIQUE(template_id, date)` constraint.
- `tests/data/checklists.test.ts` exercises the lazy-create path
  and the historical-instance preservation.

**Failure story.** Session 18's first design had a cron job that
materialized today's instances at 06:00 SGT. The cron added
infrastructure (a workflow file, a secret, monitoring) for what was
fundamentally a "do it on first read" problem. RC pushed back during
the prompt-writing stage; the lazy-create design landed instead.
Eight months later, the cron is still not needed.

The pattern generalizes to any time-based operational state where:
- The template is small and stable.
- The per-instance shape is small.
- "Generate it on first access" is acceptable.

---

## 13. Soft-delete moderation

**Problem.** Hard-deleting a moderated post breaks downstream
references (likes, replies pending support) and destroys the audit
trail. Reversing a moderation action becomes a data-recovery
exercise.

**How it works.**
Moderated content sets a `deleted_at` timestamp instead of
disappearing. RLS hides soft-deleted rows from regular SELECT
paths; manager/owner queries can opt in. The row stays for FK
safety and audit; rendering paths skip rows where `deleted_at IS
NOT NULL`.

In the social feed (Session 20), `posts.deleted_at` is the
moderation gate. UPDATE and DELETE on `posts` are not covered by
any RLS policy, which makes them deny-by-default for the anon and
authenticated roles. Soft-delete goes through the service role via
`deletePostAction`, which enforces "author OR manager/owner" in
application code.

**Where it's enforced.**
- `supabase/migrations/010_social_feed.sql` — `posts.deleted_at`
  column and RLS shape.
- `src/app/actions/posts.ts` — `deletePostAction` with the
  application-level authorization check.
- `tests/actions/posts.test.ts` and `tests/data/posts.test.ts`
  exercise soft-delete behaviour.

**Failure story.** Session 20's spec considered hard-delete first.
The pivot came from thinking through the FK consequences: post
likes (`post_likes`) reference posts. A hard delete would either
cascade-delete likes (silent loss of data) or leave dangling
references (RI violation). Soft-delete sidesteps both, preserves
the moderation audit trail, and makes "I moderated the wrong post"
a one-row UPDATE to undo. Hard-delete is reserved for
GDPR-equivalent erasure requests, which haven't happened yet but
have a documented path.

---

## 14. Stripe webhook idempotency via audit log dedup

**Problem.** Stripe retries webhooks aggressively on non-2xx
responses. Network glitches cause duplicate deliveries. A double-
applied `invoice.paid` webhook would reset credits twice in a
billing cycle, which is a real customer impact (a member might lose
a partial allocation).

**How it works.**
Each Stripe webhook event carries an `id`. Before the handler runs,
the receiver checks the audit log for a row with that event ID; if
present, the handler is skipped and the receiver returns 200. The
audit row is written *after* the handler succeeds, so a failed
handler (which returns non-2xx) doesn't poison future retries.

**Where it's enforced.**
- `src/app/api/webhooks/stripe/route.ts` — the receiver does the
  dedup check.
- `src/lib/stripe/*.ts` — per-event handlers consume the deduped
  events.
- `tests/stripe/webhooks.test.ts` exercises the dedup path.

**Failure story.** Session 10 added the dedup explicitly because the
S7 implementation had the credit-reset on `invoice.paid` running on
every delivery. A staging-environment retry storm during a Stripe
test exposed the issue; no production impact, but the fix was
prioritized into the next session.

The pattern is general: any external-event handler that has
potentially non-idempotent side effects needs idempotency. The
audit-log dedup is convenient because the audit log is already
there for other reasons. A dedicated `stripe_webhook_events` table
would have worked too; the audit log was simpler.

---

## 15. Opportunistic sweep for time-based state transitions

**Problem.** A booking that ends should transition from
`confirmed` to `completed`. A standing scheduled job (cron) could
do this, but adds infrastructure. The states only matter when
something actually reads them; doing the transition on read is
free.

**How it works.**
Pages and queries that care about completed-vs-confirmed state run
an "auto-complete" sweep before they read: any booking with
`status = 'confirmed'` and `ends_at <= now()` is updated to
`status = 'completed'`. The sweep is bounded (latest N rows) so it
stays cheap.

State transitions become eventually consistent: a booking that
ended an hour ago might still show as `confirmed` until someone
loads the calendar, but the moment someone does, it transitions.
For analytics and reporting, the eventual consistency is
acceptable; for "right now on the floor", the floor view triggers
the sweep on every load.

**Where it's enforced.**
- `src/lib/data/bookings.ts` — the auto-complete helper.
- Calendar and floor data accessors call the helper before reading.
- `tests/data/bookings.test.ts` exercises the sweep.

**Failure story.** Session 10 originally specced a cron job for
booking state transitions. RC questioned it: the only places that
read booking state are pages someone has to load. If nobody loads,
the state doesn't need to be current. If someone loads, the load
itself can do the transition. The cron was dropped; the
opportunistic sweep landed.

The pattern doesn't apply when:
- A side effect must fire at the transition (e.g., a push
  notification, an external webhook). For those, you need a real
  scheduler. Booking reminders (S17) use cron because the push
  must fire whether or not anyone is looking.
- Latency matters more than infrastructure. The auto-complete
  sweep adds a few ms to the page load that triggers it; for that
  page, the cost is paid up front rather than amortized.

---

## 16. Polymorphic authorship

**Problem.** The social feed (Session 20) needs posts authored by
either members or staff. Eventually, system-generated posts
(tournament results, achievement unlocks) need to be authored by
"the system". A single `author_id` foreign key to one table
doesn't work; a join table per author kind explodes the schema.

**How it works.**
`posts` carries either `author_member_id` XOR `author_staff_id`
(for human authors) OR `system_generated = true` with both nulls.
A `posts_authorship` CHECK constraint enforces the XOR-or-system
rule at the database level so bad writes are rejected.

Reads enrich each post with an `author` shape that resolves to a
unified `Author` discriminated union: `{ kind: 'member', ... }`,
`{ kind: 'staff', ... }`, or `{ kind: 'system' }`. Components
render based on the `kind` discriminator.

**Where it's enforced.**
- `supabase/migrations/010_social_feed.sql` — `posts_authorship`
  CHECK constraint.
- `src/lib/data/posts.ts` — `listFeed` enriches with author via
  embedded-resource joins (`author_member:members!...`,
  `author_staff:staff!...`).
- `src/components/feed/PostCard.tsx` renders each kind.

**Failure story.** This pattern hasn't fired a bug yet — it was
designed defensively from the start because Session 20's spec
explicitly named tournament-result auto-posts as an upcoming use
case. The DB-level CHECK constraint guards the invariant; a
test (`tests/data/posts.test.ts`) verifies that the data layer
returns the right discriminator for each row shape. The pattern is
listed here so future "I'll add a third author type" work uses the
existing structure rather than retrofit.

The same shape applies to competitions' polymorphic entrants
(`comp_competition_entrants` is exactly one of member, guest, or
team — see `comp_matches_entrants_when_active` CHECK in migration
012). Different feature, same idea.
