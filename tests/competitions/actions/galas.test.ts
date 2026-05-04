import { describe, it, expect, beforeEach } from "vitest";
import { createGala, setGalaManualPairings } from "@/competitions/actions/galas";
import { listPairingsByFixture } from "@/competitions/data/fixture-pairings";
import { getFixture } from "@/competitions/data/fixtures";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const PREMIER_LEAGUE = "comp-league-spring-premier";
const PREMIER_DIV = "comp-division-spring-premier";
const SEASON = "comp-season-spring-2026";

const FOUR_TEAMS = [
  "comp-team-felt-tips",
  "comp-team-chalk-dust",
  "comp-team-cue-crew",
  "comp-team-break-point",
];

describe("createGala action", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("rejects unauthenticated callers", async () => {
    const res = await createGala({
      seasonId: SEASON,
      divisionId: PREMIER_DIV,
      competitionId: PREMIER_LEAGUE,
      participantTeamIds: FOUR_TEAMS,
      pairingMode: "gala_round_robin",
    });
    expect(res.success).toBe(false);
  });

  it("rejects non-manager staff", async () => {
    signInAs("mock-staff-1");
    const res = await createGala({
      seasonId: SEASON,
      divisionId: PREMIER_DIV,
      competitionId: PREMIER_LEAGUE,
      participantTeamIds: FOUR_TEAMS,
      pairingMode: "gala_round_robin",
    });
    expect(res.success).toBe(false);
  });

  it("creates a round-robin gala with auto-generated pairings (4 teams → 6 pairings)", async () => {
    signInAs("mock-manager-1");
    const res = await createGala({
      seasonId: SEASON,
      divisionId: PREMIER_DIV,
      competitionId: PREMIER_LEAGUE,
      participantTeamIds: FOUR_TEAMS,
      pairingMode: "gala_round_robin",
      scheduledAt: "2026-04-01T19:00:00.000Z",
    });
    expect(res.success).toBe(true);
    expect(res.id).toBeTruthy();

    const fixture = await getFixture(res.id!);
    expect(fixture!.pairing_mode).toBe("gala_round_robin");
    expect(fixture!.home_entrant_id).toBeNull();
    expect(fixture!.away_entrant_id).toBeNull();

    const pairings = await listPairingsByFixture(res.id!);
    expect(pairings).toHaveLength(6);
  });

  it("creates a manual gala with no pairings yet", async () => {
    signInAs("mock-manager-1");
    const res = await createGala({
      seasonId: SEASON,
      divisionId: PREMIER_DIV,
      competitionId: PREMIER_LEAGUE,
      participantTeamIds: FOUR_TEAMS,
      pairingMode: "gala_manual",
    });
    expect(res.success).toBe(true);
    expect(await listPairingsByFixture(res.id!)).toEqual([]);
  });

  it("setGalaManualPairings replaces pairings on a manual gala", async () => {
    signInAs("mock-manager-1");
    const created = await createGala({
      seasonId: SEASON,
      divisionId: PREMIER_DIV,
      competitionId: PREMIER_LEAGUE,
      participantTeamIds: FOUR_TEAMS,
      pairingMode: "gala_manual",
    });
    expect(created.success).toBe(true);

    const set1 = await setGalaManualPairings({
      fixtureId: created.id!,
      pairings: [
        { homeTeamId: "comp-team-felt-tips", awayTeamId: "comp-team-cue-crew" },
        { homeTeamId: "comp-team-chalk-dust", awayTeamId: "comp-team-break-point" },
      ],
    });
    expect(set1.success).toBe(true);
    expect(await listPairingsByFixture(created.id!)).toHaveLength(2);

    const set2 = await setGalaManualPairings({
      fixtureId: created.id!,
      pairings: [
        { homeTeamId: "comp-team-felt-tips", awayTeamId: "comp-team-chalk-dust" },
      ],
    });
    expect(set2.success).toBe(true);
    expect(await listPairingsByFixture(created.id!)).toHaveLength(1);
  });

  it("setGalaManualPairings rejects same-team pairings and duplicates", async () => {
    signInAs("mock-manager-1");
    const created = await createGala({
      seasonId: SEASON,
      divisionId: PREMIER_DIV,
      competitionId: PREMIER_LEAGUE,
      participantTeamIds: FOUR_TEAMS,
      pairingMode: "gala_manual",
    });
    const sameTeam = await setGalaManualPairings({
      fixtureId: created.id!,
      pairings: [
        { homeTeamId: "comp-team-felt-tips", awayTeamId: "comp-team-felt-tips" },
      ],
    });
    expect(sameTeam.success).toBe(false);
    const dup = await setGalaManualPairings({
      fixtureId: created.id!,
      pairings: [
        { homeTeamId: "comp-team-felt-tips", awayTeamId: "comp-team-cue-crew" },
        { homeTeamId: "comp-team-cue-crew", awayTeamId: "comp-team-felt-tips" },
      ],
    });
    expect(dup.success).toBe(false);
  });

  it("setGalaManualPairings rejects when fixture is a round-robin gala (not manual)", async () => {
    signInAs("mock-manager-1");
    const created = await createGala({
      seasonId: SEASON,
      divisionId: PREMIER_DIV,
      competitionId: PREMIER_LEAGUE,
      participantTeamIds: FOUR_TEAMS,
      pairingMode: "gala_round_robin",
    });
    const res = await setGalaManualPairings({
      fixtureId: created.id!,
      pairings: [
        { homeTeamId: "comp-team-felt-tips", awayTeamId: "comp-team-cue-crew" },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toMatch(/manual/i);
  });
});
