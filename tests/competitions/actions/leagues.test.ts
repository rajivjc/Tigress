import { describe, it, expect, beforeEach } from "vitest";
import { createLeagueCompetitionAction } from "@/competitions/actions/leagues";
import { defaultSupportedLeagueConfig } from "@/competitions/lib/standings";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";
import type { LeagueConfig, TeamMatchConfig } from "@/competitions/types";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const DIVISION = "comp-division-spring-div1";
const GAME_TYPE = "eight_ball";
const baseSlots = [
  { id: "s1", kind: "singles" as const, race_to: 5, sort_order: 1 },
  { id: "s2", kind: "singles" as const, race_to: 5, sort_order: 2 },
];
const teamMatchConfig: TeamMatchConfig = { slots: baseSlots };
const supportedConfig: LeagueConfig = defaultSupportedLeagueConfig(baseSlots);

describe("createLeagueCompetitionAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("manager can create a league with supported config", async () => {
    signInAs("mock-manager-1");
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: DIVISION,
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: supportedConfig,
    });
    expect(res.success).toBe(true);
    expect(res.id).toBeTruthy();
  });

  it("rejects anonymous caller", async () => {
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: DIVISION,
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: supportedConfig,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sign/i);
  });

  it("rejects staff (manager+ required)", async () => {
    signInAs("mock-staff-1");
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: DIVISION,
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: supportedConfig,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });

  it("rejects missing division", async () => {
    signInAs("mock-manager-1");
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: "nonexistent",
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: supportedConfig,
    });
    expect(res.success).toBe(false);
  });

  it("rejects unsupported config with feature-named error", async () => {
    signInAs("mock-manager-1");
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: DIVISION,
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: {
        ...supportedConfig,
        fixture_format: "round_robin_single",
      },
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/round_robin_single/);
  });

  it("rejects archived season", async () => {
    signInAs("mock-owner-1");
    const { archiveSeasonAction } = await import(
      "@/competitions/actions/seasons"
    );
    // Archive the Spring season which is the season for DIVISION.
    await archiveSeasonAction("comp-season-spring-2026");

    signInAs("mock-manager-1");
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: DIVISION,
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: supportedConfig,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/archiv/i);
  });

  it("rejects lineup.rule = 'loose'", async () => {
    signInAs("mock-manager-1");
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: DIVISION,
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: {
        ...supportedConfig,
        lineup: { rule: "loose", allow_player_in_multiple_slots: false },
      },
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/lineup/);
  });

  it("rejects per_sub_match points rule", async () => {
    signInAs("mock-manager-1");
    const res = await createLeagueCompetitionAction({
      name: "Test League",
      description: null,
      divisionId: DIVISION,
      gameTypeId: GAME_TYPE,
      guestPolicy: "members_only",
      teamMatchConfig,
      leagueConfig: {
        ...supportedConfig,
        points: {
          rule: "per_sub_match",
          win_points: 1,
          draw_points: 0,
          loss_points: 0,
        },
      },
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/per_sub_match/);
  });
});
