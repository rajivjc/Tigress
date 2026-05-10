# Handover Archive

This directory holds snapshots of project state at key moments in
development, preserved as historical record. They are **period documents,
not current truth**. When something here contradicts the four canonical
docs (`ARCHITECTURE.md`, `DECISIONS.md`, `PATTERNS.md`, `PROCESS.md`),
the canonical docs win.

## What lives here

Four phase-boundary handovers, each written at the close of a major
arc and intended as the on-ramp for whoever picked the project up
next:

- `01-after-s8-phase-1-mid.md` — drafted as Session 9 was being
  prepared. Covers Phase 1 build (S1–S8): Next.js scaffold,
  auth + role resolution, member booking flow, atomic credit RPCs,
  staff floor/calendar/walk-in/members views, owner settings,
  Stripe webhook plumbing.
- `02-after-s13-phase-1-close.md` — Phase 1 declared
  feature-complete. Adds the audit fix-up (S11), UI/UX polish
  (S12), responsive calendar (S13), and Supabase going live in
  the deployed environment. The README's "Phase 1 feature
  complete" status line was set in this window.
- `03-after-s19-phase-2-tier-2-close.md` — Phase 2 Tier 1–2
  complete. PWA foundation (S14), Web Push notifications (S15),
  no-show tracking (S16), booking reminders cron (S17), daily
  checklists (S18), recipe book (S19). Marks the point where
  notifications became infrastructure rather than a feature.
- `04-after-s24b2-fix-phase-2-close.md` — Phase 2 Tier 3 closed
  out and the competitions module reached engine-completeness.
  Social feed (S20), competitions module foundation (S21),
  single-elimination tournaments (S22), league foundation (S23),
  schedule generator + multi-team galas (S24a), standings engine
  completion (S24b1), promotion/relegation (S24b2). Ends with
  the boundary discipline that makes the competitions module
  lift-out-able as a standalone product.

The current `TIGRESS_HANDOVER.md` at the repo root covers
S25–S27b-fix (scheduling foundation through payroll engine
close-out). When the next phase begins, that file gets archived
here too.

## Provenance note (Session 28)

Session 28 created this archive directory but **did not have the
four prior handover files supplied to it at archive time**. The
files listed above are the *intended* archive — RC will append
the actual handover documents in a follow-up commit. Until then,
this README is the placeholder that documents the slot each file
occupies.

When the priors are added, this paragraph should be removed and
the README simplified to the "What lives here" section above.

## Reading these files

A few things to know going in:

- **Header dates are unreliable.** All four prior handovers
  carry an "April 2026" header line, which is true of only some
  of them. The four were drafted at points spanning several
  weeks. If a date matters, cross-reference `git log` rather
  than trust the header.
- **Some claims are superseded.** A handover written after S13
  describes the system as it stood after S13. Patterns, table
  shapes, and even some module boundary rules have moved since.
  When you see "the X module imports Y", treat it as descriptive
  of the moment, not prescriptive for today.
- **The handovers have value beyond their facts.** They show how
  thinking *evolved* — what was uncertain, what was deferred,
  what was reversed. That trail is hard to reconstruct from
  source code alone.

For current architecture and decision context, start with
`docs/ARCHITECTURE.md` and `docs/DECISIONS.md`. The handovers
here are background reading.
