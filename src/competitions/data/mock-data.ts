// =============================================================================
// Competitions — module-owned mock fixtures (Session 21)
// =============================================================================
// Lives inside the module so everything competition-related can be wired up
// without touching `src/lib/data/mock-data.ts`. The top-level resetMockData
// helper imports + clears these arrays so tests stay deterministic.
// =============================================================================

import type {
  Competition,
  CompetitionEntrant,
  CompetitionGuest,
  GameType,
  Match,
  MatchResult,
  PlayerSkill,
  Team,
  TeamMember,
  TeamMatchConfig,
} from "../types";

const now = "2026-04-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Game types (matches the seed in migration 011)
// ---------------------------------------------------------------------------
export const MOCK_COMP_GAME_TYPES: GameType[] = [
  {
    id: "eight_ball",
    display_name: "8-ball",
    default_race_to: 5,
    rules_notes: "WPA rules, ball-in-hand on foul",
    sort_order: 10,
    created_at: now,
  },
  {
    id: "nine_ball",
    display_name: "9-ball",
    default_race_to: 7,
    rules_notes: "Rotation, call pocket on 9",
    sort_order: 20,
    created_at: now,
  },
  {
    id: "ten_ball",
    display_name: "10-ball",
    default_race_to: 5,
    rules_notes: "Call shot, call pocket",
    sort_order: 30,
    created_at: now,
  },
  {
    id: "straight",
    display_name: "Straight pool (14.1)",
    default_race_to: 75,
    rules_notes: "Race to N total balls",
    sort_order: 40,
    created_at: now,
  },
  {
    id: "one_pocket",
    display_name: "One-pocket",
    default_race_to: 3,
    rules_notes: "Each player owns one corner pocket",
    sort_order: 50,
    created_at: now,
  },
  {
    id: "bank_pool",
    display_name: "Bank pool",
    default_race_to: 3,
    rules_notes: "Every shot must be banked",
    sort_order: 60,
    created_at: now,
  },
];

// ---------------------------------------------------------------------------
// Player skills — 4 members with varying levels
// ---------------------------------------------------------------------------
const MOCK_MANAGER_STAFF_ID = "mock-staff-row-2";

export const MOCK_COMP_PLAYER_SKILLS: PlayerSkill[] = [
  {
    member_id: "mock-member-row-1",
    skill_level: 5,
    updated_by_staff_id: MOCK_MANAGER_STAFF_ID,
    updated_at: now,
  },
  {
    member_id: "mock-member-row-2",
    skill_level: 7,
    updated_by_staff_id: MOCK_MANAGER_STAFF_ID,
    updated_at: now,
  },
  {
    member_id: "mock-member-row-3",
    skill_level: 4,
    updated_by_staff_id: MOCK_MANAGER_STAFF_ID,
    updated_at: now,
  },
  {
    member_id: "mock-member-row-4",
    skill_level: 6,
    updated_by_staff_id: MOCK_MANAGER_STAFF_ID,
    updated_at: now,
  },
];

// ---------------------------------------------------------------------------
// Guests — one invited-by-Mona, one paying-added-by-Maya
// ---------------------------------------------------------------------------
export const MOCK_COMP_GUESTS: CompetitionGuest[] = [
  {
    id: "comp-guest-1",
    display_name: "Riley Guest",
    email: null,
    phone: null,
    is_paying: false,
    registered_by_member_id: "mock-member-row-1",
    registered_by_staff_id: null,
    notes: "Mona's +1 for Friday league",
    created_at: now,
    archived_at: null,
  },
  {
    id: "comp-guest-2",
    display_name: "Dana Paying",
    email: "dana@example.com",
    phone: null,
    is_paying: true,
    registered_by_member_id: null,
    registered_by_staff_id: MOCK_MANAGER_STAFF_ID,
    notes: "Walk-in, paid $20 entry",
    created_at: now,
    archived_at: null,
  },
];

// ---------------------------------------------------------------------------
// Teams — two, both active
// ---------------------------------------------------------------------------
export const MOCK_COMP_TEAMS: Team[] = [
  {
    id: "comp-team-felt-tips",
    name: "Felt Tips",
    captain_member_id: "mock-member-row-1",
    status: "active",
    created_at: now,
    updated_at: now,
  },
  {
    id: "comp-team-chalk-dust",
    name: "Chalk Dust",
    captain_member_id: "mock-member-row-2",
    status: "active",
    created_at: now,
    updated_at: now,
  },
];

// Team rosters — no overlap (mock mode enforces the same invariant Supabase
// would via PK on comp_team_members).
export const MOCK_COMP_TEAM_MEMBERS: TeamMember[] = [
  // Felt Tips (Mona + Priya)
  {
    team_id: "comp-team-felt-tips",
    member_id: "mock-member-row-1",
    added_at: now,
  },
  {
    team_id: "comp-team-felt-tips",
    member_id: "mock-member-row-3",
    added_at: now,
  },
  // Chalk Dust (Alex + Jordan)
  {
    team_id: "comp-team-chalk-dust",
    member_id: "mock-member-row-2",
    added_at: now,
  },
  {
    team_id: "comp-team-chalk-dust",
    member_id: "mock-member-row-4",
    added_at: now,
  },
];

// ---------------------------------------------------------------------------
// Competitions — 1 draft tournament, 1 draft league
// ---------------------------------------------------------------------------
const sampleLeagueMatchConfig: TeamMatchConfig = {
  slots: [
    { id: "singles_1", kind: "singles", race_to: 5, sort_order: 1 },
    { id: "singles_2", kind: "singles", race_to: 5, sort_order: 2 },
    { id: "singles_3", kind: "singles", race_to: 5, sort_order: 3 },
  ],
};

export const MOCK_COMP_COMPETITIONS: Competition[] = [
  {
    id: "comp-tournament-draft-1",
    name: "Spring 9-Ball Open",
    description: "Open 32-player single-elim to kick off the season.",
    kind: "tournament",
    format: "single_elim",
    entrant_type: "individual",
    game_type_id: "nine_ball",
    guest_policy: "members_only",
    team_match_config: null,
    status: "draft",
    registration_opens_at: null,
    registration_closes_at: null,
    starts_at: null,
    ends_at: null,
    created_by_staff_id: MOCK_MANAGER_STAFF_ID,
    created_at: now,
    updated_at: now,
  },
  // S22 — lifecycle showcase: registration_open tournament.
  {
    id: "comp-tournament-regopen-1",
    name: "Friday 8-Ball Knockout",
    description: "Open to all active members. Single-elim, race to 5.",
    kind: "tournament",
    format: "single_elim",
    entrant_type: "individual",
    game_type_id: "eight_ball",
    guest_policy: "members_only",
    team_match_config: null,
    status: "registration_open",
    registration_opens_at: "2026-04-15T00:00:00.000Z",
    registration_closes_at: "2026-04-30T00:00:00.000Z",
    starts_at: "2026-05-01T13:00:00.000Z",
    ends_at: null,
    created_by_staff_id: MOCK_MANAGER_STAFF_ID,
    created_at: "2026-04-10T00:00:00.000Z",
    updated_at: "2026-04-15T00:00:00.000Z",
  },
  // S22 — lifecycle showcase: in_progress tournament with partial results.
  {
    id: "comp-tournament-inprogress-1",
    name: "March Madness 8-Ball",
    description: "Bracket in progress — round 1 complete, round 2 partial.",
    kind: "tournament",
    format: "single_elim",
    entrant_type: "individual",
    game_type_id: "eight_ball",
    guest_policy: "members_only",
    team_match_config: null,
    status: "in_progress",
    registration_opens_at: "2026-03-01T00:00:00.000Z",
    registration_closes_at: "2026-03-15T00:00:00.000Z",
    starts_at: "2026-03-20T13:00:00.000Z",
    ends_at: null,
    created_by_staff_id: MOCK_MANAGER_STAFF_ID,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  },
  // S22 — lifecycle showcase: completed tournament.
  {
    id: "comp-tournament-completed-1",
    name: "Valentine's 9-Ball Cup",
    description: "4-player single-elim. Mona took it 7-5 in the final.",
    kind: "tournament",
    format: "single_elim",
    entrant_type: "individual",
    game_type_id: "nine_ball",
    guest_policy: "members_only",
    team_match_config: null,
    status: "completed",
    registration_opens_at: "2026-02-01T00:00:00.000Z",
    registration_closes_at: "2026-02-10T00:00:00.000Z",
    starts_at: "2026-02-14T13:00:00.000Z",
    ends_at: "2026-02-14T20:00:00.000Z",
    created_by_staff_id: MOCK_MANAGER_STAFF_ID,
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-14T20:00:00.000Z",
  },
  {
    id: "comp-league-draft-1",
    name: "Wednesday Night League (Spring)",
    description: "Team league, 3 singles slots per match night.",
    kind: "league",
    format: null,
    entrant_type: "team",
    game_type_id: "eight_ball",
    guest_policy: "members_only",
    team_match_config: sampleLeagueMatchConfig,
    status: "draft",
    registration_opens_at: null,
    registration_closes_at: null,
    starts_at: null,
    ends_at: null,
    created_by_staff_id: MOCK_MANAGER_STAFF_ID,
    created_at: now,
    updated_at: now,
  },
];

// ---------------------------------------------------------------------------
// Entrants — 4 on the tournament (members), 2 teams on the league
// ---------------------------------------------------------------------------
export const MOCK_COMP_ENTRANTS: CompetitionEntrant[] = [
  // Tournament — Mona, Alex, Priya, Jordan
  {
    id: "comp-entrant-t1-1",
    competition_id: "comp-tournament-draft-1",
    entrant_member_id: "mock-member-row-1",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 1,
    status: "active",
    registered_at: now,
  },
  {
    id: "comp-entrant-t1-2",
    competition_id: "comp-tournament-draft-1",
    entrant_member_id: "mock-member-row-2",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 2,
    status: "active",
    registered_at: now,
  },
  {
    id: "comp-entrant-t1-3",
    competition_id: "comp-tournament-draft-1",
    entrant_member_id: "mock-member-row-3",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 3,
    status: "active",
    registered_at: now,
  },
  {
    id: "comp-entrant-t1-4",
    competition_id: "comp-tournament-draft-1",
    entrant_member_id: "mock-member-row-4",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 4,
    status: "active",
    registered_at: now,
  },
  // League — 2 teams
  {
    id: "comp-entrant-l1-1",
    competition_id: "comp-league-draft-1",
    entrant_member_id: null,
    entrant_guest_id: null,
    entrant_team_id: "comp-team-felt-tips",
    seed_number: null,
    status: "active",
    registered_at: now,
  },
  {
    id: "comp-entrant-l1-2",
    competition_id: "comp-league-draft-1",
    entrant_member_id: null,
    entrant_guest_id: null,
    entrant_team_id: "comp-team-chalk-dust",
    seed_number: null,
    status: "active",
    registered_at: now,
  },
  // S22 lifecycle — registration_open tournament, 4 members registered.
  {
    id: "comp-entrant-reg-1",
    competition_id: "comp-tournament-regopen-1",
    entrant_member_id: "mock-member-row-2",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 1,
    status: "active",
    registered_at: "2026-04-15T10:00:00.000Z",
  },
  {
    id: "comp-entrant-reg-2",
    competition_id: "comp-tournament-regopen-1",
    entrant_member_id: "mock-member-row-4",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 2,
    status: "active",
    registered_at: "2026-04-15T11:00:00.000Z",
  },
  {
    id: "comp-entrant-reg-3",
    competition_id: "comp-tournament-regopen-1",
    entrant_member_id: "mock-member-row-1",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 3,
    status: "active",
    registered_at: "2026-04-16T09:00:00.000Z",
  },
  {
    id: "comp-entrant-reg-4",
    competition_id: "comp-tournament-regopen-1",
    entrant_member_id: "mock-member-row-3",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 4,
    status: "active",
    registered_at: "2026-04-17T08:00:00.000Z",
  },
  // S22 lifecycle — in_progress tournament, 4 members.
  {
    id: "comp-entrant-ip-1",
    competition_id: "comp-tournament-inprogress-1",
    entrant_member_id: "mock-member-row-2",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 1,
    status: "active",
    registered_at: "2026-03-01T10:00:00.000Z",
  },
  {
    id: "comp-entrant-ip-2",
    competition_id: "comp-tournament-inprogress-1",
    entrant_member_id: "mock-member-row-4",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 2,
    status: "active",
    registered_at: "2026-03-01T11:00:00.000Z",
  },
  {
    id: "comp-entrant-ip-3",
    competition_id: "comp-tournament-inprogress-1",
    entrant_member_id: "mock-member-row-1",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 3,
    status: "active",
    registered_at: "2026-03-02T09:00:00.000Z",
  },
  {
    id: "comp-entrant-ip-4",
    competition_id: "comp-tournament-inprogress-1",
    entrant_member_id: "mock-member-row-3",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 4,
    status: "active",
    registered_at: "2026-03-02T10:00:00.000Z",
  },
  // S22 lifecycle — completed tournament, 4 members.
  {
    id: "comp-entrant-cp-1",
    competition_id: "comp-tournament-completed-1",
    entrant_member_id: "mock-member-row-1",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 1,
    status: "active",
    registered_at: "2026-02-05T10:00:00.000Z",
  },
  {
    id: "comp-entrant-cp-2",
    competition_id: "comp-tournament-completed-1",
    entrant_member_id: "mock-member-row-2",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 2,
    status: "active",
    registered_at: "2026-02-05T11:00:00.000Z",
  },
  {
    id: "comp-entrant-cp-3",
    competition_id: "comp-tournament-completed-1",
    entrant_member_id: "mock-member-row-3",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 3,
    status: "active",
    registered_at: "2026-02-05T12:00:00.000Z",
  },
  {
    id: "comp-entrant-cp-4",
    competition_id: "comp-tournament-completed-1",
    entrant_member_id: "mock-member-row-4",
    entrant_guest_id: null,
    entrant_team_id: null,
    seed_number: 4,
    status: "active",
    registered_at: "2026-02-05T13:00:00.000Z",
  },
];

// ---------------------------------------------------------------------------
// Matches + results
// ---------------------------------------------------------------------------
// draft and registration_open tournaments have no matches until publish. The
// in_progress and completed tournaments carry a persisted bracket below so
// the UI can render the full lifecycle in dev without having to manually
// publish one.
// ---------------------------------------------------------------------------

// Standard 4-entrant seed order pairs (1,4) and (2,3). With seeds 1..4:
//   R1M1: seed 1 (cp-1) vs seed 4 (cp-4)  → slot a of R2
//   R1M2: seed 2 (cp-2) vs seed 3 (cp-3)  → slot b of R2
const ipNow = "2026-03-20T15:00:00.000Z";
const cpNow = "2026-02-14T15:00:00.000Z";
const cpEnd = "2026-02-14T19:30:00.000Z";

export const MOCK_COMP_MATCHES: Match[] = [
  // ---- in_progress tournament: R1 both complete, R2 final waiting ----
  {
    id: "comp-match-ip-r1-1",
    competition_id: "comp-tournament-inprogress-1",
    entrant_a_id: "comp-entrant-ip-1", // seed 1
    entrant_b_id: "comp-entrant-ip-2", // seed 4 slot — actually seed 2 here (simplified fixture)
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: 1,
    bracket_position: 1,
    parent_match_id: null,
    scheduled_at: null,
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: ipNow,
    updated_at: ipNow,
  },
  {
    id: "comp-match-ip-r1-2",
    competition_id: "comp-tournament-inprogress-1",
    entrant_a_id: "comp-entrant-ip-3",
    entrant_b_id: "comp-entrant-ip-4",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: 1,
    bracket_position: 2,
    parent_match_id: null,
    scheduled_at: null,
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: ipNow,
    updated_at: ipNow,
  },
  {
    // Final — winners from R1M1 (slot a) and R1M2 (slot b) populated.
    id: "comp-match-ip-r2-1",
    competition_id: "comp-tournament-inprogress-1",
    entrant_a_id: "comp-entrant-ip-1",
    entrant_b_id: "comp-entrant-ip-3",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: 2,
    bracket_position: 1,
    parent_match_id: null,
    scheduled_at: null,
    booking_id: null,
    status: "scheduled",
    is_walkover: false,
    created_at: ipNow,
    updated_at: ipNow,
  },
  // ---- completed tournament: every match played, Mona (cp-1) champions ----
  {
    id: "comp-match-cp-r1-1",
    competition_id: "comp-tournament-completed-1",
    entrant_a_id: "comp-entrant-cp-1", // seed 1 (Mona)
    entrant_b_id: "comp-entrant-cp-4", // seed 4
    game_type_id: "nine_ball",
    race_to_a: 7,
    race_to_b: 7,
    round_number: 1,
    bracket_position: 1,
    parent_match_id: null,
    scheduled_at: null,
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: cpNow,
    updated_at: cpNow,
  },
  {
    id: "comp-match-cp-r1-2",
    competition_id: "comp-tournament-completed-1",
    entrant_a_id: "comp-entrant-cp-2", // seed 2
    entrant_b_id: "comp-entrant-cp-3", // seed 3
    game_type_id: "nine_ball",
    race_to_a: 7,
    race_to_b: 7,
    round_number: 1,
    bracket_position: 2,
    parent_match_id: null,
    scheduled_at: null,
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: cpNow,
    updated_at: cpNow,
  },
  {
    id: "comp-match-cp-r2-1",
    competition_id: "comp-tournament-completed-1",
    entrant_a_id: "comp-entrant-cp-1", // Mona (R1M1 winner)
    entrant_b_id: "comp-entrant-cp-2", // Alex (R1M2 winner)
    game_type_id: "nine_ball",
    race_to_a: 7,
    race_to_b: 7,
    round_number: 2,
    bracket_position: 1,
    parent_match_id: null,
    scheduled_at: null,
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: cpNow,
    updated_at: cpEnd,
  },
];

export const MOCK_COMP_MATCH_RESULTS: MatchResult[] = [
  // in_progress R1 results
  {
    match_id: "comp-match-ip-r1-1",
    winner_entrant_id: "comp-entrant-ip-1",
    score_a: 5,
    score_b: 2,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-manager-1",
    reported_at: ipNow,
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  {
    match_id: "comp-match-ip-r1-2",
    winner_entrant_id: "comp-entrant-ip-3",
    score_a: 5,
    score_b: 4,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-manager-1",
    reported_at: ipNow,
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  // completed full results
  {
    match_id: "comp-match-cp-r1-1",
    winner_entrant_id: "comp-entrant-cp-1",
    score_a: 7,
    score_b: 3,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-1",
    reported_at: cpNow,
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  {
    match_id: "comp-match-cp-r1-2",
    winner_entrant_id: "comp-entrant-cp-2",
    score_a: 7,
    score_b: 5,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-staff-1",
    reported_at: cpNow,
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  {
    match_id: "comp-match-cp-r2-1",
    winner_entrant_id: "comp-entrant-cp-1",
    score_a: 7,
    score_b: 5,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-1",
    reported_at: cpEnd,
    verified_by_staff_id: null,
    verified_at: null,
    notes: "Mona takes it in the final",
  },
];

// ---------------------------------------------------------------------------
// Test hook — reset the lazy arrays and restore seeded state.
// The top-level `resetMockData` helper calls this so module isolation holds.
// ---------------------------------------------------------------------------
export function __resetMockCompetitions(): void {
  // Matches and results are empty-seeded — just truncate.
  MOCK_COMP_MATCHES.length = 0;
  MOCK_COMP_MATCH_RESULTS.length = 0;
}
