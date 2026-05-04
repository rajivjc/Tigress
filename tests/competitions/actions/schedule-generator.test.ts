import { describe, it, expect, beforeEach } from "vitest";
import { generateSeasonFixtures } from "@/competitions/actions/schedule-generator";
import { listFixtures } from "@/competitions/data/fixtures";
import {
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_TEAMS,
  MOCK_COMP_TEAM_MEMBERS,
} from "@/competitions/data/mock-data";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const SEASON = "comp-season-spring-2026";
const DIV1 = "comp-division-spring-div1";
const DIV1_LEAGUE = "comp-league-spring-div1";

// Register 4 teams to the spring-div1 league. Tests share these helpers; the
// existing premier division is left alone so other tests aren't disturbed.
function seedDiv1Teams() {
  const now = new Date().toISOString();
  // Re-use existing teams from the premier division — entrants are
  // per-competition, so the same team_id can play in both. comp-team-felt-tips,
  // comp-team-chalk-dust, comp-team-cue-crew, comp-team-break-point are all
  // already in MOCK_COMP_TEAMS.
  const teams = [
    "comp-team-felt-tips",
    "comp-team-chalk-dust",
    "comp-team-cue-crew",
    "comp-team-break-point",
  ];
  for (const teamId of teams) {
    const team = MOCK_COMP_TEAMS.find((t) => t.id === teamId);
    expect(team, `seed team ${teamId} should exist`).toBeDefined();
  }
  for (let i = 0; i < teams.length; i++) {
    MOCK_COMP_ENTRANTS.push({
      id: `comp-entrant-d1-${i + 1}`,
      competition_id: DIV1_LEAGUE,
      entrant_member_id: null,
      entrant_guest_id: null,
      entrant_team_id: teams[i]!,
      seed_number: null,
      status: "active",
      registered_at: now,
    });
  }
  void MOCK_COMP_TEAM_MEMBERS;
}

describe("generateSeasonFixtures action", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("rejects unsigned-in callers", async () => {
    seedDiv1Teams();
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(res.success).toBe(false);
  });

  it("rejects staff (non-manager) callers", async () => {
    seedDiv1Teams();
    signInAs("mock-staff-1");
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/manager/i);
  });

  it("manager can generate fixtures into an empty division", async () => {
    seedDiv1Teams();
    signInAs("mock-manager-1");
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.generated).toBe(6); // C(4,2) = 6
    const fixtures = await listFixtures({ competitionId: DIV1_LEAGUE });
    expect(fixtures).toHaveLength(6);
    expect(fixtures.every((f) => f.round_number !== null)).toBe(true);
  });

  it("empty mode refuses when division already has fixtures", async () => {
    seedDiv1Teams();
    signInAs("mock-manager-1");
    const first = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(first.success).toBe(true);
    const second = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error).toBe("SEASON_NOT_EMPTY");
  });

  it("regenerate without confirmRegenerate is rejected", async () => {
    seedDiv1Teams();
    signInAs("mock-manager-1");
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "regenerate",
      rounds: 1,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("CONFIRM_REQUIRED");
  });

  it("regenerate refuses when results have been recorded (premier division)", async () => {
    signInAs("mock-manager-1");
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: "comp-division-spring-premier",
      mode: "regenerate",
      rounds: 1,
      confirmRegenerate: true,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toBe("RESULTS_EXIST");
  });

  it("regenerate wipes + re-creates fixtures when no results exist", async () => {
    seedDiv1Teams();
    signInAs("mock-manager-1");
    await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "regenerate",
      rounds: 2,
      confirmRegenerate: true,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.wiped).toBe(6);
      expect(res.generated).toBe(12); // double RR for 4 teams = 12
    }
    const fixtures = await listFixtures({ competitionId: DIV1_LEAGUE });
    expect(fixtures).toHaveLength(12);
  });

  it("rejects when fewer than 2 active team entrants are registered", async () => {
    signInAs("mock-manager-1");
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(res.success).toBe(false);
  });

  it("append: with no existing fixtures, generates a full RR", async () => {
    seedDiv1Teams();
    signInAs("mock-manager-1");
    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "append",
      rounds: 1,
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.generated).toBe(6);
    const fixtures = await listFixtures({ competitionId: DIV1_LEAGUE });
    expect(fixtures).toHaveLength(6);
  });

  it("append: with a complete single RR already present, generates 0 fixtures", async () => {
    seedDiv1Teams();
    signInAs("mock-manager-1");
    const first = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(first.success).toBe(true);
    const second = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "append",
      rounds: 1,
    });
    expect(second.success).toBe(true);
    if (second.success) expect(second.generated).toBe(0);
    const fixtures = await listFixtures({ competitionId: DIV1_LEAGUE });
    expect(fixtures).toHaveLength(6);
  });

  it("append: late-joining team gets exactly its missing pairings, with new round numbers continuing past the existing max", async () => {
    seedDiv1Teams();
    signInAs("mock-manager-1");
    const seedRes = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "empty",
      rounds: 1,
    });
    expect(seedRes.success).toBe(true);
    const initial = await listFixtures({ competitionId: DIV1_LEAGUE });
    expect(initial).toHaveLength(6);
    const initialMaxRound = Math.max(
      ...initial.map((f) => f.round_number ?? 0)
    );
    expect(initialMaxRound).toBe(3);

    // Add a 5th, distinct team entrant. The first four entrants reuse the
    // teams from the premier division; the late-joiner needs its own row in
    // MOCK_COMP_TEAMS so the entrant resolves to a brand-new team.
    const now = new Date().toISOString();
    MOCK_COMP_TEAMS.push({
      id: "comp-team-late-joiner",
      name: "Late Joiner",
      captain_member_id: "mock-member-row-1",
      status: "active",
      created_at: now,
      updated_at: now,
    });
    MOCK_COMP_ENTRANTS.push({
      id: "comp-entrant-d1-5",
      competition_id: DIV1_LEAGUE,
      entrant_member_id: null,
      entrant_guest_id: null,
      entrant_team_id: "comp-team-late-joiner",
      seed_number: null,
      status: "active",
      registered_at: now,
    });

    const res = await generateSeasonFixtures({
      seasonId: SEASON,
      divisionId: DIV1,
      mode: "append",
      rounds: 1,
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.generated).toBe(4);

    const fixtures = await listFixtures({ competitionId: DIV1_LEAGUE });
    expect(fixtures).toHaveLength(10);

    const newFixtures = fixtures.filter(
      (f) =>
        f.home_entrant_id === "comp-entrant-d1-5" ||
        f.away_entrant_id === "comp-entrant-d1-5"
    );
    expect(newFixtures).toHaveLength(4);
    const newRounds = newFixtures
      .map((f) => f.round_number ?? -1)
      .sort((a, b) => a - b);
    expect(newRounds).toEqual([4, 5, 6, 7]);
  });
});
