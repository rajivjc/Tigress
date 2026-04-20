import { describe, it, expect, beforeEach } from "vitest";
import {
  createCompetitionDraftAction,
  deleteCompetitionDraftAction,
  updateCompetitionStatusAction,
} from "@/competitions/actions/competitions";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

describe("competitions actions (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("owner creates a draft tournament", async () => {
    signInAs("mock-owner-1");
    const res = await createCompetitionDraftAction({
      name: "Owner tournament",
      description: null,
      kind: "tournament",
      format: "single_elim",
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
    });
    expect(res.success).toBe(true);
    expect(res.id).toBeTruthy();
  });

  it("manager can create too (S21 allows manager)", async () => {
    signInAs("mock-manager-1");
    const res = await createCompetitionDraftAction({
      name: "Manager tournament",
      description: null,
      kind: "tournament",
      format: "swiss",
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
    });
    expect(res.success).toBe(true);
  });

  it("rejects creation for plain staff", async () => {
    signInAs("mock-staff-1");
    const res = await createCompetitionDraftAction({
      name: "Staff tournament",
      description: null,
      kind: "tournament",
      format: "single_elim",
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });

  it("rejects unsigned callers", async () => {
    const res = await createCompetitionDraftAction({
      name: "Anon tournament",
      description: null,
      kind: "tournament",
      format: "single_elim",
      entrant_type: "individual",
      game_type_id: "eight_ball",
      guest_policy: "members_only",
      team_match_config: null,
      registration_opens_at: null,
      registration_closes_at: null,
      starts_at: null,
      ends_at: null,
    });
    expect(res.success).toBe(false);
  });

  it("delete refuses non-draft status", async () => {
    signInAs("mock-owner-1");
    await updateCompetitionStatusAction(
      "comp-tournament-draft-1",
      "registration_open"
    );
    const res = await deleteCompetitionDraftAction(
      "comp-tournament-draft-1"
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/draft/i);
  });
});
