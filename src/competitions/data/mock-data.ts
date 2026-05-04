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
  Division,
  Fixture,
  FixturePairing,
  GameType,
  LeagueConfig,
  Match,
  MatchLineup,
  MatchResult,
  PlayerSkill,
  PromotionDecision,
  Season,
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
    division_id: null,
    league_config: null,
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
    division_id: null,
    league_config: null,
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
    division_id: null,
    league_config: null,
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
    division_id: null,
    league_config: null,
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
    division_id: null,
    league_config: null,
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
    fixture_id: null,
    pairing_id: null,
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
    fixture_id: null,
    pairing_id: null,
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
    fixture_id: null,
    pairing_id: null,
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
    fixture_id: null,
    pairing_id: null,
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
    fixture_id: null,
    pairing_id: null,
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
    fixture_id: null,
    pairing_id: null,
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

// =============================================================================
// League foundation (Session 23)
// =============================================================================
// Two seasons (one active, one completed), four divisions, two active league
// competitions tied to the active season's divisions, and four fixtures per
// league to exercise standings rendering.
// =============================================================================

export const MOCK_COMP_SEASONS: Season[] = [
  {
    id: "comp-season-spring-2026",
    name: "Spring 2026",
    starts_at: "2026-03-01T00:00:00.000Z",
    ends_at: "2026-06-30T00:00:00.000Z",
    status: "active",
    next_season_id: null,
    created_at: "2026-02-15T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "comp-season-winter-2025",
    name: "Winter 2025",
    starts_at: "2025-11-01T00:00:00.000Z",
    ends_at: "2026-02-28T00:00:00.000Z",
    status: "completed",
    next_season_id: "comp-season-spring-2026",
    created_at: "2025-10-15T00:00:00.000Z",
    updated_at: "2026-02-28T00:00:00.000Z",
  },
];

export const MOCK_COMP_DIVISIONS: Division[] = [
  // Active season divisions
  {
    id: "comp-division-spring-premier",
    season_id: "comp-season-spring-2026",
    league_name: "Wednesday Night",
    tier: 1,
    tier_name: "Premier",
    promote_count: 0,
    relegate_count: 1,
    promotions_finalized_at: null,
    promotions_finalized_by: null,
    created_at: "2026-02-20T00:00:00.000Z",
  },
  {
    id: "comp-division-spring-div1",
    season_id: "comp-season-spring-2026",
    league_name: "Wednesday Night",
    tier: 2,
    tier_name: "Division 1",
    promote_count: 1,
    relegate_count: 0,
    promotions_finalized_at: null,
    promotions_finalized_by: null,
    created_at: "2026-02-20T00:00:00.000Z",
  },
  // Completed season divisions (same league names — supports S24
  // promotion/relegation stubs)
  {
    id: "comp-division-winter-premier",
    season_id: "comp-season-winter-2025",
    league_name: "Wednesday Night",
    tier: 1,
    tier_name: "Premier",
    promote_count: 0,
    relegate_count: 1,
    promotions_finalized_at: null,
    promotions_finalized_by: null,
    created_at: "2025-10-20T00:00:00.000Z",
  },
  {
    id: "comp-division-winter-div1",
    season_id: "comp-season-winter-2025",
    league_name: "Wednesday Night",
    tier: 2,
    tier_name: "Division 1",
    promote_count: 1,
    relegate_count: 0,
    promotions_finalized_at: null,
    promotions_finalized_by: null,
    created_at: "2025-10-20T00:00:00.000Z",
  },
];

// S24b2 — append-only audit trail for promote/relegate/stay decisions.
export const MOCK_COMP_PROMOTION_DECISIONS: PromotionDecision[] = [];

const sampleLeagueConfig: LeagueConfig = {
  version: 1,
  fixture_format: "flexible",
  home_away: "tracked",
  points: {
    rule: "win_draw_loss",
    win_points: 3,
    draw_points: 1,
    loss_points: 0,
  },
  lineup: {
    rule: "strict",
    allow_player_in_multiple_slots: false,
  },
  sub_match_slots: [
    { id: "singles_1", kind: "singles", race_to: 5, sort_order: 1 },
    { id: "singles_2", kind: "singles", race_to: 5, sort_order: 2 },
    { id: "singles_3", kind: "singles", race_to: 5, sort_order: 3 },
  ],
  tiebreakers: ["head_to_head", "sub_match_diff"],
};

// Two additional teams so each league has 4 entrants.
export const MOCK_COMP_LEAGUE_TEAMS: Team[] = [
  {
    id: "comp-team-cue-crew",
    name: "Cue Crew",
    captain_member_id: "mock-member-row-3",
    status: "active",
    created_at: "2026-02-25T00:00:00.000Z",
    updated_at: "2026-02-25T00:00:00.000Z",
  },
  {
    id: "comp-team-break-point",
    name: "Break Point",
    captain_member_id: "mock-member-row-4",
    status: "active",
    created_at: "2026-02-25T00:00:00.000Z",
    updated_at: "2026-02-25T00:00:00.000Z",
  },
];
// Append them to the existing MOCK_COMP_TEAMS so the module sees one array.
MOCK_COMP_TEAMS.push(...MOCK_COMP_LEAGUE_TEAMS);

// Rosters for the extra teams (single-member rosters are fine for S23 demo).
export const MOCK_COMP_LEAGUE_TEAM_MEMBERS: TeamMember[] = [
  {
    team_id: "comp-team-cue-crew",
    member_id: "mock-member-row-3",
    added_at: "2026-02-25T00:00:00.000Z",
  },
  {
    team_id: "comp-team-cue-crew",
    member_id: "mock-member-row-1",
    added_at: "2026-02-25T00:00:00.000Z",
  },
  {
    team_id: "comp-team-break-point",
    member_id: "mock-member-row-4",
    added_at: "2026-02-25T00:00:00.000Z",
  },
  {
    team_id: "comp-team-break-point",
    member_id: "mock-member-row-2",
    added_at: "2026-02-25T00:00:00.000Z",
  },
];
MOCK_COMP_TEAM_MEMBERS.push(...MOCK_COMP_LEAGUE_TEAM_MEMBERS);

// Two active league competitions in the Spring season.
const springLeaguePremier: Competition = {
  id: "comp-league-spring-premier",
  name: "Wednesday Night Premier (Spring 2026)",
  description: "Top-flight team league. Three singles slots per night.",
  kind: "league",
  format: null,
  entrant_type: "team",
  game_type_id: "eight_ball",
  guest_policy: "members_only",
  team_match_config: sampleLeagueMatchConfig,
  division_id: "comp-division-spring-premier",
  league_config: sampleLeagueConfig,
  status: "in_progress",
  registration_opens_at: "2026-02-20T00:00:00.000Z",
  registration_closes_at: "2026-02-28T00:00:00.000Z",
  starts_at: "2026-03-04T19:00:00.000Z",
  ends_at: null,
  created_by_staff_id: MOCK_MANAGER_STAFF_ID,
  created_at: "2026-02-20T00:00:00.000Z",
  updated_at: "2026-03-04T00:00:00.000Z",
};
const springLeagueDiv1: Competition = {
  id: "comp-league-spring-div1",
  name: "Wednesday Night Division 1 (Spring 2026)",
  description: "Second tier. Same three-slot format.",
  kind: "league",
  format: null,
  entrant_type: "team",
  game_type_id: "eight_ball",
  guest_policy: "members_only",
  team_match_config: sampleLeagueMatchConfig,
  division_id: "comp-division-spring-div1",
  league_config: sampleLeagueConfig,
  status: "registration_open",
  registration_opens_at: "2026-03-01T00:00:00.000Z",
  registration_closes_at: "2026-03-15T00:00:00.000Z",
  starts_at: "2026-03-18T19:00:00.000Z",
  ends_at: null,
  created_by_staff_id: MOCK_MANAGER_STAFF_ID,
  created_at: "2026-02-20T00:00:00.000Z",
  updated_at: "2026-03-01T00:00:00.000Z",
};
MOCK_COMP_COMPETITIONS.push(springLeaguePremier, springLeagueDiv1);

// 4 entrants on the Premier league.
const premierEntrants: CompetitionEntrant[] = [
  {
    id: "comp-entrant-sp-felt",
    competition_id: "comp-league-spring-premier",
    entrant_member_id: null,
    entrant_guest_id: null,
    entrant_team_id: "comp-team-felt-tips",
    seed_number: null,
    status: "active",
    registered_at: "2026-02-25T10:00:00.000Z",
  },
  {
    id: "comp-entrant-sp-chalk",
    competition_id: "comp-league-spring-premier",
    entrant_member_id: null,
    entrant_guest_id: null,
    entrant_team_id: "comp-team-chalk-dust",
    seed_number: null,
    status: "active",
    registered_at: "2026-02-25T11:00:00.000Z",
  },
  {
    id: "comp-entrant-sp-cue",
    competition_id: "comp-league-spring-premier",
    entrant_member_id: null,
    entrant_guest_id: null,
    entrant_team_id: "comp-team-cue-crew",
    seed_number: null,
    status: "active",
    registered_at: "2026-02-25T12:00:00.000Z",
  },
  {
    id: "comp-entrant-sp-break",
    competition_id: "comp-league-spring-premier",
    entrant_member_id: null,
    entrant_guest_id: null,
    entrant_team_id: "comp-team-break-point",
    seed_number: null,
    status: "active",
    registered_at: "2026-02-25T13:00:00.000Z",
  },
];
MOCK_COMP_ENTRANTS.push(...premierEntrants);

// Premier league fixtures: 4 in total. 2 completed with meaningful W/D/L,
// 1 in_progress with partial results, 1 scheduled (no lineups yet).
export const MOCK_COMP_FIXTURES: Fixture[] = [
  // Completed: Felt Tips beat Chalk Dust 2–1
  {
    id: "comp-fixture-1",
    competition_id: "comp-league-spring-premier",
    fixture_date: "2026-03-04T19:00:00.000Z",
    home_entrant_id: "comp-entrant-sp-felt",
    away_entrant_id: "comp-entrant-sp-chalk",
    round_number: null,
    is_bye: false,
    bye_entrant_id: null,
    pairing_mode: "two_team",
    status: "completed",
    notes: null,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-04T22:00:00.000Z",
  },
  // Completed: Cue Crew vs Break Point drew 1-1 (third sub-match null)
  //   ↳ to keep W/D/L variety, encode a 1-1 draw
  {
    id: "comp-fixture-2",
    competition_id: "comp-league-spring-premier",
    fixture_date: "2026-03-11T19:00:00.000Z",
    home_entrant_id: "comp-entrant-sp-cue",
    away_entrant_id: "comp-entrant-sp-break",
    round_number: null,
    is_bye: false,
    bye_entrant_id: null,
    pairing_mode: "two_team",
    status: "completed",
    notes: null,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-11T22:00:00.000Z",
  },
  // In-progress: Felt Tips vs Cue Crew — first sub-match done, rest scheduled
  {
    id: "comp-fixture-3",
    competition_id: "comp-league-spring-premier",
    fixture_date: "2026-03-18T19:00:00.000Z",
    home_entrant_id: "comp-entrant-sp-felt",
    away_entrant_id: "comp-entrant-sp-cue",
    round_number: null,
    is_bye: false,
    bye_entrant_id: null,
    pairing_mode: "two_team",
    status: "in_progress",
    notes: null,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-18T20:00:00.000Z",
  },
  // Scheduled: Chalk Dust vs Break Point — no lineups set yet
  {
    id: "comp-fixture-4",
    competition_id: "comp-league-spring-premier",
    fixture_date: "2026-03-25T19:00:00.000Z",
    home_entrant_id: "comp-entrant-sp-chalk",
    away_entrant_id: "comp-entrant-sp-break",
    round_number: null,
    is_bye: false,
    bye_entrant_id: null,
    pairing_mode: "two_team",
    status: "scheduled",
    notes: null,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-02-26T00:00:00.000Z",
  },
];

// Sub-matches for each fixture (3 slots × 4 fixtures = 12 matches total,
// minus the scheduled fixture which has 0). Fixture 1 → 3 sub-matches,
// Fixture 2 → 3 sub-matches, Fixture 3 → 3 sub-matches (only 1 played).
const leagueSubMatches: Match[] = [
  // Fixture 1: Felt Tips wins 2-1
  {
    id: "comp-match-lg-1-s1",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-felt",
    entrant_b_id: "comp-entrant-sp-chalk",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-1",
    pairing_id: null,
    scheduled_at: "2026-03-04T19:00:00.000Z",
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-04T19:45:00.000Z",
  },
  {
    id: "comp-match-lg-1-s2",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-felt",
    entrant_b_id: "comp-entrant-sp-chalk",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-1",
    pairing_id: null,
    scheduled_at: "2026-03-04T20:00:00.000Z",
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-04T20:45:00.000Z",
  },
  {
    id: "comp-match-lg-1-s3",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-felt",
    entrant_b_id: "comp-entrant-sp-chalk",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-1",
    pairing_id: null,
    scheduled_at: "2026-03-04T21:00:00.000Z",
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-04T21:45:00.000Z",
  },
  // Fixture 2: Cue Crew draws Break Point 1-1 (third sub-match drawn in
  // sub-match terms — one ball each = half-each in an odd count, so to
  // keep points a draw at the fixture level we land the third with Cue.
  // Actually easier: 1 win each + 1 null = drawn-by-default at the
  // fixture level but that means 1-1 sub-match count.  We'll give CC 1
  // and BP 1, leave third empty (stays at 1-1 → draw).
  {
    id: "comp-match-lg-2-s1",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-cue",
    entrant_b_id: "comp-entrant-sp-break",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-2",
    pairing_id: null,
    scheduled_at: "2026-03-11T19:00:00.000Z",
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-11T19:45:00.000Z",
  },
  {
    id: "comp-match-lg-2-s2",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-cue",
    entrant_b_id: "comp-entrant-sp-break",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-2",
    pairing_id: null,
    scheduled_at: "2026-03-11T20:00:00.000Z",
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-11T20:45:00.000Z",
  },
  {
    id: "comp-match-lg-2-s3",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-cue",
    entrant_b_id: "comp-entrant-sp-break",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-2",
    pairing_id: null,
    scheduled_at: "2026-03-11T21:00:00.000Z",
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-11T21:45:00.000Z",
  },
  // Fixture 3 in-progress: only first sub-match has a result.
  {
    id: "comp-match-lg-3-s1",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-felt",
    entrant_b_id: "comp-entrant-sp-cue",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-3",
    pairing_id: null,
    scheduled_at: "2026-03-18T19:00:00.000Z",
    booking_id: null,
    status: "completed",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-03-18T19:45:00.000Z",
  },
  {
    id: "comp-match-lg-3-s2",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-felt",
    entrant_b_id: "comp-entrant-sp-cue",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-3",
    pairing_id: null,
    scheduled_at: "2026-03-18T20:00:00.000Z",
    booking_id: null,
    status: "scheduled",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-02-26T00:00:00.000Z",
  },
  {
    id: "comp-match-lg-3-s3",
    competition_id: "comp-league-spring-premier",
    entrant_a_id: "comp-entrant-sp-felt",
    entrant_b_id: "comp-entrant-sp-cue",
    game_type_id: "eight_ball",
    race_to_a: 5,
    race_to_b: 5,
    round_number: null,
    bracket_position: null,
    parent_match_id: null,
    fixture_id: "comp-fixture-3",
    pairing_id: null,
    scheduled_at: "2026-03-18T21:00:00.000Z",
    booking_id: null,
    status: "scheduled",
    is_walkover: false,
    created_at: "2026-02-26T00:00:00.000Z",
    updated_at: "2026-02-26T00:00:00.000Z",
  },
];
MOCK_COMP_MATCHES.push(...leagueSubMatches);

const leagueSubMatchResults: MatchResult[] = [
  // Fixture 1: Felt wins 2-1
  {
    match_id: "comp-match-lg-1-s1",
    winner_entrant_id: "comp-entrant-sp-felt",
    score_a: 5,
    score_b: 3,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-1",
    reported_at: "2026-03-04T19:45:00.000Z",
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  {
    match_id: "comp-match-lg-1-s2",
    winner_entrant_id: "comp-entrant-sp-chalk",
    score_a: 2,
    score_b: 5,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-1",
    reported_at: "2026-03-04T20:45:00.000Z",
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  {
    match_id: "comp-match-lg-1-s3",
    winner_entrant_id: "comp-entrant-sp-felt",
    score_a: 5,
    score_b: 2,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-1",
    reported_at: "2026-03-04T21:45:00.000Z",
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  // Fixture 2: Cue Crew draws Break Point 1-1 overall (one each, one drawn
  // → winner_entrant_id null on the third).
  {
    match_id: "comp-match-lg-2-s1",
    winner_entrant_id: "comp-entrant-sp-cue",
    score_a: 5,
    score_b: 4,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-3",
    reported_at: "2026-03-11T19:45:00.000Z",
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  {
    match_id: "comp-match-lg-2-s2",
    winner_entrant_id: "comp-entrant-sp-break",
    score_a: 3,
    score_b: 5,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-4",
    reported_at: "2026-03-11T20:45:00.000Z",
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  {
    match_id: "comp-match-lg-2-s3",
    winner_entrant_id: "comp-entrant-sp-cue",
    score_a: 5,
    score_b: 4,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-3",
    reported_at: "2026-03-11T21:45:00.000Z",
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
  // Actually the third result above makes CC win 2-1 — flip to draw by
  // reassigning: keep s1 CC, s2 BP, s3 null-winner by deleting. Simpler:
  // we re-assign s3 to BP so it's 1-2 (BP wins). But we want draw across
  // the league for W/D/L variety. Let's change s3 to BP winner:
  // (we'll just re-assign in the array below by mutating.)
  // Fixture 3: first sub-match only, Felt wins.
  {
    match_id: "comp-match-lg-3-s1",
    winner_entrant_id: "comp-entrant-sp-felt",
    score_a: 5,
    score_b: 3,
    broken_by_entrant_id: null,
    flags: {},
    reported_by_auth_user_id: "mock-member-1",
    reported_at: "2026-03-18T19:45:00.000Z",
    verified_by_staff_id: null,
    verified_at: null,
    notes: null,
  },
];
// Fix Fixture 2 to actually be a draw: flip s3 to Break Point winner so
// sub-match score 1-2 — wait that gives BP the fixture win. For a true
// draw we need equal sub-match wins — so delete the s3 result instead.
// Slice removes it.
const s3ResultIdx = leagueSubMatchResults.findIndex(
  (r) => r.match_id === "comp-match-lg-2-s3"
);
if (s3ResultIdx >= 0) leagueSubMatchResults.splice(s3ResultIdx, 1);
// And set that match status back to completed-with-no-winner: easiest
// is to update its result absence. The match row already says status
// 'completed' — computeStandings treats winner=null sub-matches as ties,
// which is exactly what we want.
MOCK_COMP_MATCH_RESULTS.push(...leagueSubMatchResults);

// Lineups — set for fixtures 1, 2, 3 (singles slots, 1 member per side).
// All seeded rows are roster members under strict mode → approval_status is
// always 'not_required' here. The S24b1 sub_with_approval flow only stages
// pending rows when an explicitly non-roster member is fielded.
export const MOCK_COMP_MATCH_LINEUPS: MatchLineup[] = [
  // Fixture 1 (Felt Tips vs Chalk Dust)
  {
    match_id: "comp-match-lg-1-s1",
    entrant_id: "comp-entrant-sp-felt",
    member_id: "mock-member-row-1",
    side: "a",
    recorded_at: "2026-03-04T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
  {
    match_id: "comp-match-lg-1-s1",
    entrant_id: "comp-entrant-sp-chalk",
    member_id: "mock-member-row-2",
    side: "b",
    recorded_at: "2026-03-04T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
  {
    match_id: "comp-match-lg-1-s2",
    entrant_id: "comp-entrant-sp-felt",
    member_id: "mock-member-row-3",
    side: "a",
    recorded_at: "2026-03-04T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
  {
    match_id: "comp-match-lg-1-s2",
    entrant_id: "comp-entrant-sp-chalk",
    member_id: "mock-member-row-4",
    side: "b",
    recorded_at: "2026-03-04T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
  {
    match_id: "comp-match-lg-1-s3",
    entrant_id: "comp-entrant-sp-felt",
    member_id: "mock-member-row-1",
    side: "a",
    recorded_at: "2026-03-04T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
  {
    match_id: "comp-match-lg-1-s3",
    entrant_id: "comp-entrant-sp-chalk",
    member_id: "mock-member-row-4",
    side: "b",
    recorded_at: "2026-03-04T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
  // Fixture 3 — lineups set but play incomplete
  {
    match_id: "comp-match-lg-3-s1",
    entrant_id: "comp-entrant-sp-felt",
    member_id: "mock-member-row-1",
    side: "a",
    recorded_at: "2026-03-18T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
  {
    match_id: "comp-match-lg-3-s1",
    entrant_id: "comp-entrant-sp-cue",
    member_id: "mock-member-row-3",
    side: "b",
    recorded_at: "2026-03-18T18:45:00.000Z",
    approval_status: "not_required",
    approved_by_member_id: null,
    approved_at: null,
    approval_note: null,
  },
];

// ---------------------------------------------------------------------------
// S24a: gala fixture pairings — empty by default. Tests + the galas action
// push to this array when creating gala fixtures.
// ---------------------------------------------------------------------------
export const MOCK_COMP_FIXTURE_PAIRINGS: FixturePairing[] = [];

// ---------------------------------------------------------------------------
// S24a: gala fixture participants — empty by default. Centralised here (not
// module-local in fixture-participants.ts) so resetMockData() can reset it
// between tests like every other comp_* mock array.
// ---------------------------------------------------------------------------
export const MOCK_COMP_FIXTURE_PARTICIPANTS: {
  fixture_id: string;
  entrant_id: string;
}[] = [];
