// =============================================================================
// Competitions — type definitions (Session 21)
// =============================================================================
// Every Competition*, Match*, etc. type lives here. Column names are
// snake_case to match what Supabase returns directly.
// =============================================================================

import type { StaffRole } from "@/lib/types";

// ---------- Enum-style unions (match DB CHECK constraints) ----------

export type CompetitionKind =
  | "tournament"
  | "league"
  | "ladder"
  | "casual";

export type CompetitionFormat =
  | "single_elim"
  | "double_elim"
  | "round_robin"
  | "swiss";

export type CompetitionEntrantType = "individual" | "team";

export type CompetitionStatus =
  | "draft"
  | "registration_open"
  | "in_progress"
  | "completed"
  | "cancelled";

export type CompetitionGuestPolicy =
  | "members_only"
  | "invited_guests"
  | "paying_guests"
  | "both_guest_types";

export type EntrantStatus = "active" | "withdrawn" | "eliminated";

export type MatchStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "forfeited"
  | "disputed";

export type TeamStatus = "active" | "archived";

export type SeasonStatus =
  | "planned"
  | "active"
  | "completed"
  | "archived";

export type FixtureStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "postponed"
  | "cancelled";

export type LineupSide = "a" | "b";

export type GameTypeId =
  | "eight_ball"
  | "nine_ball"
  | "ten_ball"
  | "straight"
  | "one_pocket"
  | "bank_pool"
  | (string & {});

// ---------- Row types (direct Supabase shapes) ----------

export interface GameType {
  id: string;
  display_name: string;
  default_race_to: number;
  rules_notes: string | null;
  sort_order: number;
  created_at: string;
}

export interface PlayerSkill {
  member_id: string;
  skill_level: number;
  updated_by_staff_id: string | null;
  updated_at: string;
}

export interface CompetitionGuest {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  is_paying: boolean;
  registered_by_member_id: string | null;
  registered_by_staff_id: string | null;
  notes: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface Team {
  id: string;
  name: string;
  captain_member_id: string;
  status: TeamStatus;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  team_id: string;
  member_id: string;
  added_at: string;
}

/**
 * Slot definitions for team-match structures (league nights). Stored as
 * JSONB on `comp_competitions.team_match_config` — not enforced at DB.
 * Resolution into child match rows happens in S23.
 */
export interface TeamMatchSlot {
  id: string;
  kind: "singles" | "doubles";
  race_to: number;
  sort_order: number;
}

export interface TeamMatchConfig {
  slots: TeamMatchSlot[];
}

export interface Competition {
  id: string;
  name: string;
  description: string | null;
  kind: CompetitionKind;
  format: CompetitionFormat | null;
  entrant_type: CompetitionEntrantType;
  game_type_id: string;
  guest_policy: CompetitionGuestPolicy;
  team_match_config: TeamMatchConfig | null;
  division_id: string | null;
  league_config: LeagueConfig | null;
  status: CompetitionStatus;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_by_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitionEntrant {
  id: string;
  competition_id: string;
  entrant_member_id: string | null;
  entrant_guest_id: string | null;
  entrant_team_id: string | null;
  seed_number: number | null;
  status: EntrantStatus;
  registered_at: string;
}

export interface Match {
  id: string;
  competition_id: string;
  entrant_a_id: string | null;
  entrant_b_id: string | null;
  game_type_id: string;
  race_to_a: number;
  race_to_b: number;
  round_number: number | null;
  bracket_position: number | null;
  parent_match_id: string | null;
  fixture_id: string | null;
  /** S24a: scopes this sub-match to a specific gala pairing. Null for
   *  2-team fixtures. */
  pairing_id: string | null;
  scheduled_at: string | null;
  booking_id: string | null;
  status: MatchStatus;
  is_walkover: boolean;
  created_at: string;
  updated_at: string;
}

export interface MatchResult {
  match_id: string;
  winner_entrant_id: string;
  score_a: number;
  score_b: number;
  broken_by_entrant_id: string | null;
  flags: Record<string, unknown>;
  reported_by_auth_user_id: string | null;
  reported_at: string;
  verified_by_staff_id: string | null;
  verified_at: string | null;
  notes: string | null;
}

// ---------- Player identity (via adapter) ----------

export type PlayerKind = "member" | "guest" | "staff";

export type Player =
  | {
      kind: "member";
      id: string;
      displayName: string;
      skillLevel: number | null;
      avatarUrl: string | null;
    }
  | {
      kind: "guest";
      id: string;
      displayName: string;
      skillLevel: null;
      isPaying: boolean;
    }
  | {
      kind: "staff";
      id: string;
      displayName: string;
      skillLevel: null;
      role: StaffRole;
    };

export type PlayerRef =
  | { kind: "member"; id: string }
  | { kind: "guest"; id: string }
  | { kind: "staff"; id: string };

/**
 * An entrant resolved to its subject (player or team) for display. Teams
 * remain "teams" — the UI draws a team name, not a roster.
 */
export type EntrantSubject =
  | { kind: "player"; player: Player }
  | { kind: "team"; team: Team; captain: Player | null };

export interface EnrichedEntrant {
  entrant: CompetitionEntrant;
  subject: EntrantSubject | null;
}

// ---------- League foundation (Session 23) ----------

export interface Season {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  status: SeasonStatus;
  created_at: string;
  updated_at: string;
}

export interface Division {
  id: string;
  season_id: string;
  league_name: string;
  tier: number;
  tier_name: string;
  created_at: string;
}

export type FixturePairingMode = "two_team" | "gala_round_robin" | "gala_manual";

export interface Fixture {
  id: string;
  competition_id: string;
  fixture_date: string;
  home_entrant_id: string | null;
  away_entrant_id: string | null;
  status: FixtureStatus;
  notes: string | null;
  /** 1-indexed round inside a generated round-robin schedule. Null for
   *  legacy / manually created fixtures. */
  round_number: number | null;
  is_bye: boolean;
  pairing_mode: FixturePairingMode;
  created_at: string;
  updated_at: string;
}

export interface FixturePairing {
  id: string;
  fixture_id: string;
  home_team_id: string;
  away_team_id: string;
  pairing_order: number;
  created_at: string;
}

export interface MatchLineup {
  match_id: string;
  entrant_id: string;
  member_id: string;
  side: LineupSide;
  recorded_at: string;
}

/**
 * League configuration. Stored as JSONB on `comp_competitions.league_config`;
 * validation + standings engines live in `src/competitions/lib/standings.ts`.
 * S23 implements only a narrow supported subset — other values are stored but
 * `computeStandings` throws `LeagueConfigNotImplementedError(feature)` when
 * asked to compute with them.
 */
export interface LeagueConfig {
  version: 1;
  fixture_format: "round_robin_single" | "round_robin_double" | "flexible";
  home_away: "tracked" | "label_only" | "none";
  points: {
    rule: "win_draw_loss" | "win_loss" | "per_sub_match";
    win_points: number;
    draw_points: number;
    loss_points: number;
  };
  lineup: {
    rule: "strict" | "loose" | "sub_with_approval";
    allow_player_in_multiple_slots: boolean;
  };
  sub_match_slots: TeamMatchSlot[];
  tiebreakers: ("head_to_head" | "sub_match_diff" | "sub_matches_won")[];
}

// ---------- Audit events ----------

export type CompAuditEventType =
  | "comp.competition.created"
  | "comp.competition.status_changed"
  | "comp.competition.deleted"
  | "comp.entrant.added"
  | "comp.entrant.removed"
  | "comp.entrant.self_registered"
  | "comp.entrant.self_withdrew"
  | "comp.match.created"
  | "comp.match.status_changed"
  | "comp.match.result_recorded"
  | "comp.match.result_verified"
  | "comp.match.result_cleared"
  | "comp.match.advance_triggered"
  | "comp.bracket.published"
  | "comp.bracket.cleared"
  | "comp.team.created"
  | "comp.team.archived"
  | "comp.team.roster_added"
  | "comp.team.roster_removed"
  | "comp.guest.created"
  | "comp.guest.archived"
  | "comp.skill.updated"
  // Session 23 — league events
  | "comp.season.created"
  | "comp.season.status_changed"
  | "comp.season.archived"
  | "comp.division.created"
  | "comp.division.deleted"
  | "comp.fixture.created"
  | "comp.fixture.status_changed"
  | "comp.fixture.cancelled"
  | "comp.fixture.postponed"
  | "comp.fixture.completed"
  | "comp.lineup.set"
  | "comp.lineup.cleared"
  | "comp.league.created"
  // Session 24a — schedule + gala events
  | "comp.season.fixtures_generated"
  | "comp.season.fixtures_regenerated"
  | "comp.fixture.gala_created"
  | "comp.fixture.gala_pairings_set";
