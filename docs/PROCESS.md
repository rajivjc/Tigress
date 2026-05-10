# Process

Tigress is built by two collaborators in conversation: RC, the
project owner and operator, and Claude — split across two roles.
**Claude Chat** drafts session prompts and runs audits in
conversation. **Claude Code** executes the prompts inside the repo
and produces commits. The discipline that makes this work is the
loop between them.

This file documents the loop. The patterns it codifies are
repeatable beyond Tigress, but the specifics here are what we
actually do.

## Workflow loop

```
spec drafted    →    Claude Code         →    audit in chat   →    fix-ups folded
in chat              executes against         (Claude Chat         into next
                     repo, single                + RC)              session prompt
                     commit
```

1. **Spec drafted in chat.** RC and Claude Chat write a session
   prompt. The prompt names a single feature scope, lists
   requirements, calls out mock/real parity explicitly, and
   includes the verification gate.
2. **Claude Code executes against the repo.** One commit per
   session, on `main`. The commit message references the session
   number.
3. **Audit in chat.** RC and Claude Chat read the diff, verify
   claims against code, and produce a findings list classified
   critical / medium / lower / observation.
4. **Fix-ups folded.** Critical and medium findings either land in
   a dedicated `S{N}-fix` session, or fold into the next planned
   session's prompt. Lower findings and observations defer.

The loop has run continuously from S1 through S27b-fix. Mock/real
parity is maintained throughout — every session's deliverable must
work without Supabase.

## Session prompt structure

Every session prompt that goes to Claude Code has the same shape:

- **Session number and title.** "Session 25: scheduling foundation".
- **Why this session.** One paragraph framing the feature against
  the current state. Explains the constraint that motivates the
  scope.
- **Source material to mine.** Files in the repo, prior handovers,
  related specs. "Read these aggressively."
- **Deliverables.** A bullet list of concrete artifacts: schema,
  data layer, server actions, components, tests, mock fixtures.
- **Constraints.** Mock/real parity. No new third-party deps unless
  explicitly justified. Use existing primitives where they fit.
  Don't violate the boundary tests.
- **Verification.** The four-step gate (see below) plus
  feature-specific spot-checks. For institutional-memory work
  (security guards, atomicity tests, regression spies), include a
  deliberate-violation step.
- **Commit.** Single commit on `main` with a suggested message.
- **Out of scope.** Explicitly named non-goals. Often longer than
  the deliverables list — scope discipline is the most contagious
  thing in the loop.

The prompt is the contract. Claude Code reads `CLAUDE.md` at
startup for the standing rules; the prompt adds the session-specific
contract on top.

## Mandatory verification sequence

Before any commit, all four steps must pass:

```bash
npx tsc --noEmit
npm run build
npm run lint
npx vitest run
```

The four-step gate is documented in `CLAUDE.md` and explicitly
restated in every session prompt. Skipping any step is grounds for
an audit-blocking finding.

`tsc --noEmit` is the load-bearing addition. Vitest transpiles via
esbuild without type-checking, and `next build` only type-checks
files in the app's import graph. Test files routinely escape both.
The S24b1 audit caught two type errors in test files that
build/lint/vitest all missed; the gate was upgraded from three
steps to four in S24b1-fix. See ADR-008.

The order matters slightly: `tsc --noEmit` is fastest to fail and
gives the most direct error message, so it runs first.

## Audit methodology

After every Claude Code commit, the audit runs in chat. The
mechanical structure is consistent across sessions:

1. **Get the lay of the land.**

   ```bash
   git log --oneline -15
   git diff [prev-hash]..[head-hash] --stat
   ```

   The first command shows what landed in this session and the
   last few before it (for context). The second gives shape: how
   many files, where they live, roughly how big.

2. **Read targeted per-file diffs by domain.** Data layer, action
   layer, components, tests, schema — each separately. Reading
   these together produces noise; reading them apart lets each
   layer be evaluated against its own rules.

3. **Spot-check claims against code.** Every "this does X" in the
   commit message or session report is a candidate for verification.
   Read the actual file. Confirm. Move on.

4. **Deliberate-violation for institutional-memory work.** For
   security guards, atomicity tests, and regression spies — revert
   the fix, run the test, watch it fail, restore. If the test
   passes when the fix is reverted, the test is wrong. See
   Pattern 7 in `PATTERNS.md` for the receipts; ADR-013 for the
   formal rule.

5. **Synthesize.** Each finding gets a classification, a clear
   description of the issue, and (where possible) a suggested fix
   shape. The output of the audit is the input to the next
   session's prompt.

The audit is collaborative. Claude Chat does the mechanical
sweep and proposes findings; RC challenges, defers, escalates, or
folds into the next prompt.

## Findings classification

Every audit finding lands in one of four buckets:

- **Critical.** Security, data integrity, or correctness bug that
  would have shipped to production. Blocks. Either rolls into a
  same-day fix-up or is the entire scope of the next session.
- **Medium.** Quality issue that doesn't immediately corrupt data
  but reduces trust. Type drift, missing tests, divergent mock/real
  paths, missing audit events on state transitions. Blocks
  progression past the next session — fix it before adding new
  feature scope.
- **Lower.** Improvement that wouldn't bite immediately. Naming
  inconsistency, redundant fetch, inline TODO that's no longer
  needed. Defers to the next session's prompt or a later fix-up
  pass.
- **Observation.** Documented for future reference, no action
  required. "Note that the current invariant only holds because of
  X; if X changes, this needs revisiting."

Critical and medium block the loop. Lower and observation flow
into prompts as time allows.

## Fix-up session pattern

When audit findings exceed what can comfortably fold into the next
planned session's prompt, the response is a dedicated fix-up
session. Naming convention: `S{N}-fix`, where `N` is the audit
target. The fix-up's scope is defined entirely by the audit's
critical and medium findings.

Fix-ups in history:

| Origin | Fix-up | Carried |
|---|---|---|
| S16 audit | S17 prompt | Type fix folded into next feature session |
| S24a audit | S24a-fix | Audit findings before S24b started |
| S24b1 audit | S24b1-fix | Audit findings before S24b2 started |
| S24b2 audit | S24b2-fix | Audit findings to close out competitions |
| S25 audit | S26 prompt | Critical RLS leak + atomicity findings folded in |
| S26 audit | S27a prompt | Critical RLS leak (different shape) + clock semantics folded in |
| S27a audit | S27a-fix | Owner-only RPC enforcement, OT timezone, lock semantics |
| S27a-fix audit | S27a-fix-2 | RLS pattern guard strengthening (boolean-aware OR-branch) |
| S27b audit | S27b-fix | Rollback test correctness, listing transformer parity |

Fix-ups are not a sign of failure. They're a sign that the audit
discipline is working — better to land a small fix-up commit than
to ship a half-fixed feature in the next session.

## Session sizing

Single sessions are preferred when a scope fits cleanly. When a
scope feels heavy, split it. The naming convention is `S{N}a` and
`S{N}b` (further subdivisible: `S24b1`, `S24b2`).

Splits in history:

- **S24a / S24b** — competitions module: schedule generator and
  galas first (S24a), standings completion and promotion/relegation
  second (S24b). S24b further split into S24b1 (standings) and
  S24b2 (promotion/relegation).
- **S27a / S27b** — payroll: engine + run lifecycle first (S27a),
  payslip exports + owner settings UI second (S27b). Claude Chat
  flagged that S27b should also split; Claude Code declined and
  the session landed cleanly anyway. The option was the right call;
  declining it was the right call for that specific session, but
  the next time the option arises, it should still be the default.

The cost of splitting is two prompts and two commits. The benefit
is two smaller diffs that are independently reviewable, two
smaller audit surfaces, and a tighter rollback story. See ADR-014.

## Single-commit discipline

Every session ships in one commit on `main`. Multi-commit sessions
are reserved for fix-ups that uncover further fix-ups (rare). The
commit message references the session number explicitly.

The convention isn't enforced by tooling; it's enforced by the
loop. A session that produces five commits would be flagged in the
audit because the commit boundary is the audit boundary — five
commits means five audits, or one audit with too much surface to
read coherently.

The discipline pays out in `git log --oneline`: the session number
is visible, the scope is visible, the order is visible. New
contributors can read the log as the project's narrative.

## `CLAUDE.md` as project intelligence

`CLAUDE.md` is the file Claude Code reads at the start of every
session. It is *not* a comprehensive reference; it is the
operational handbook for the next session.

Contents (current shape, evolves organically):

- Project overview and tech stack.
- Architecture patterns (data layer shape, server-action shape,
  role hierarchy, auth resolution, timezone helper).
- Key conventions (`server-only` import, snake_case for DB,
  route-group structure).
- Database overview and credit operation specifics.
- Environment (mock-mode activation, test accounts).
- Development workflow rules (one feature scope per session,
  audit after each, mock/real parity).
- Mandatory four-step verification sequence.
- Per-feature notes for every shipped feature, with the load-
  bearing facts a future session needs (schema names, RPC names,
  RLS policy names, mock fixture references).
- Testing patterns (the throw-injection atomicity pattern is the
  canonical entry; see Pattern 3 in `PATTERNS.md`).

`CLAUDE.md` evolves organically as features land. It is not
versioned in any structured way; the source of truth is whatever
is on `main`. The four canonical docs in `docs/` are the durable
record; `CLAUDE.md` is the working memory.

When the same caveat starts appearing in multiple session prompts,
that's the signal to promote it from prompt-text to `CLAUDE.md`.
When the caveat outgrows even that — when it becomes a decision
worth recording rather than a rule of thumb — it migrates further
into `DECISIONS.md` or `PATTERNS.md`.

## Documentation hierarchy

Four layers, each with a different audience and refresh rate:

- **`CLAUDE.md`** — Claude Code's on-ramp at session start.
  High-tactical-density. Evolves continuously. Lives at repo root
  so it's always discoverable.
- **`docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
  `docs/PATTERNS.md`, `docs/PROCESS.md`** — durable engineering
  documentation. Refreshed at phase boundaries. The decision and
  pattern files are append-only; the architecture and process
  files are revisable.
- **`TIGRESS_HANDOVER.md`** at repo root — the latest phase
  close-out handover. Replaced each phase. Carries the "where we
  are right now" snapshot for whoever picks up next.
- **`docs/_handovers/`** — historical archive of prior handovers,
  immutable. When the current `TIGRESS_HANDOVER.md` is superseded,
  it moves here under a descriptive filename.

Other top-level files (`README.md`, `DEPLOYMENT.md`,
`SPECIFICATIONS.md`) serve specific audiences (new contributors,
operators, the original product spec) and aren't part of the
engineering-doc loop.

## When to write new ADRs and patterns

The bar for writing a new entry:

- **ADR.** A decision was made whose reasoning would otherwise be
  lost. Rule of thumb: if the next person to read the code would
  ask "why did they do it this way?", and the answer isn't
  obvious from a 30-second glance, an ADR is warranted.
- **Pattern.** A bug got through *and got caught*, and the catch
  produced a reusable mechanism. Pattern entries that don't have
  a failure story attached are weaker. If you're tempted to write
  a pattern entry from first principles, ask: has this actually
  bitten us? If not, defer.

Both files are append-only. ADRs that are overturned get a new
ADR with `Status: Superseded by ADR-MMM` and the old ADR keeps
its original text. Patterns that get refined get edited in place
(the pattern *is* the current rule), but the failure story
section is preserved as historical context.

## What this process does *not* do

- **No CI-side audit gate.** The verification gate is
  type/build/lint/vitest; the audit is a chat conversation. We
  trust the loop; we don't bolt on automation.
- **No PR review process.** Sessions land directly on `main`. The
  audit is the review, but it happens after the commit.
- **No release versioning.** Tigress is one tenant; the
  deployment is the version. Phases are conceptual, not tagged.
- **No formal scoping doc per feature.** The session prompt is
  the scoping doc. When the prompt is right, the scope is right.
- **No estimation.** Sessions are sized by content, not by time.
  A session takes as long as it takes.

These omissions are deliberate. Each was considered and rejected
because the loop is the value: any addition that slows the loop
without proportionate benefit gets dropped before it's adopted.
