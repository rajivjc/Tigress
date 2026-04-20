# Competitions module

Tournaments, leagues, ladders, and casual matches for the Tigress club
platform. Intentionally isolated so the module can be extracted into a
standalone product later.

## Purpose

Covers the full lifecycle of competitive play at the venue: structured
tournaments with brackets, season-long leagues with team nights, ladder
challenges, and casual matches that members record for fun. Session 21
ships only the foundation — storage, module boundary, Player adapter, and
an owner-only admin create page. Bracket generation, standings, member
registration UI, and feed auto-posts land in subsequent sessions.

## Boundary rules

The module is designed to be **lift-out-able**. That only stays true if we
police the boundary:

### Nothing outside `src/competitions/` imports from inside, except:

- Route pages in `src/app/(owner)/competitions/**` (the admin UI)
- The competitions nav entry in `src/components/ui/StaffSidebar.tsx`
- Test files under `tests/competitions/**`

### Nothing inside `src/competitions/` imports from outside, except:

- `src/competitions/data/players.ts` — the Player adapter. This is the
  **only** file that may import from `@/lib/data/members`,
  `@/lib/data/staff`, `@/lib/auth/*`, and `@/lib/supabase/*`. Everything
  else in the module works with `Player` / `PlayerRef` and has no
  knowledge of the host app's identity layer.
- `src/competitions/audit.ts` — may import `@/lib/supabase/admin` and
  `@/lib/supabase/env` to write to the shared `audit_log` table.
- Shared primitives are allowed everywhere: `@/lib/supabase/env`,
  `@/lib/timezone`, `@/lib/types` (for `StaffRole` etc.), `server-only`.

A boundary test (`tests/competitions/boundary.test.ts`) grep-checks these
rules on every CI run.

## Adapter surface

| Hook | File | Purpose |
|------|------|---------|
| Player adapter | `data/players.ts` | Resolves current user, lists eligible entrants, maps PlayerRef → Player |
| Audit wrapper | `audit.ts` | Writes `comp.*` events to the shared audit_log |
| Events emitter | `events.ts` | Placeholder for S26 feed auto-posts |

If the module is extracted, only these three files need rewriting against
the new host.

## Table inventory (`comp_*`)

| Table | Purpose |
|-------|---------|
| `comp_game_types` | Reference data: 8-ball, 9-ball, straight, etc. Seeded. |
| `comp_player_skills` | Per-member integer 1..10, displayed on profile. |
| `comp_guests` | Non-member competition entrants. Distinct from `walk_in_guests`. |
| `comp_teams` | Named teams with a member captain. |
| `comp_team_members` | Current team rosters. |
| `comp_competitions` | Tournament / league / ladder / casual definitions. |
| `comp_competition_entrants` | Polymorphic entrants (member XOR guest XOR team). |
| `comp_matches` | Scheduled and completed matches. |
| `comp_match_results` | One result row per completed match. |

## Key design choices

- **Polymorphic entrants.** A single `comp_competition_entrants` row points
  at a member **or** a guest **or** a team. Matches reference entrants, not
  players — so guest-vs-member and team-vs-team work uniformly.
- **Manual handicaps.** Skill levels are display-only. Each match stores
  its own `race_to_a` / `race_to_b` so organisers set the handicap
  explicitly per match. No automatic adjustment.
- **Team-night structure.** `comp_matches.parent_match_id` lets a league
  night be modelled as a parent team-vs-team match with child singles /
  doubles sub-matches. Individual competitions leave `parent_match_id`
  null.
- **Loose booking link.** `comp_matches.booking_id` is a nullable FK to
  the existing `bookings` table. Staff book the table manually; the match
  row is just annotated.
- **`comp.*` audit prefix.** Every audit event written by this module uses
  the `comp.` prefix so a future extraction can find them with a single
  `LIKE 'comp.%'`.

## Extraction guide

If this module ever becomes a standalone product:

1. Lift `src/competitions/` wholesale to the new repo.
2. Lift every `comp_*` table (migration 011 + any follow-ups) and the
   `comp.*` audit events.
3. Rewrite the three adapter files (`data/players.ts`, `audit.ts`,
   `events.ts`) against the new host's identity / logging / feed layer.
4. Replace the shared type imports (`StaffRole`) with local equivalents.

Everything else — data accessors, server actions, types, UI, tests —
should move without modification.

## Roadmap

| Session | Scope |
|---------|-------|
| **S21** | Foundation: tables, module boundary, Player adapter, owner admin create/view page. |
| S22 | Tournament brackets: single/double elimination + round-robin + Swiss. Member registration UI. |
| S23 | League standings and team-night sub-match resolution. |
| S25 | Ladder challenge mechanics. |
| S26 | Feed auto-posts on competition completion and milestone unlocks. |
