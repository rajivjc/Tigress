import { describe, it, expect, beforeEach } from "vitest";
import {
  registerForTournamentAction,
  withdrawFromTournamentAction,
} from "@/competitions/actions/registration";
import { listEntrants } from "@/competitions/data/entrants";
import { updateCompetitionStatus } from "@/competitions/data/competitions";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const TOURNAMENT_ID = "comp-tournament-draft-1";

describe("registerForTournamentAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("member registers when status='registration_open'", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-member-1");

    // Use a fresh tournament so the default 4-entrant seed doesn't already
    // have our member registered. Remove existing entrants first.
    const existing = await listEntrants(TOURNAMENT_ID);
    const selfAlreadyIn = existing.some(
      (e) => e.entrant_member_id === "mock-member-row-1"
    );
    if (selfAlreadyIn) {
      // The mock seed DOES include Mona as entrant t1-1. Unregister via
      // the action itself so the test is realistic.
      const res = await withdrawFromTournamentAction(TOURNAMENT_ID);
      expect(res.success).toBe(true);
    }

    const res = await registerForTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(true);
    expect(res.entrantId).toBeTruthy();
    const after = await listEntrants(TOURNAMENT_ID);
    expect(
      after.some((e) => e.entrant_member_id === "mock-member-row-1")
    ).toBe(true);
  });

  it("rejects when competition is in draft", async () => {
    signInAs("mock-member-1");
    // Default seed has status='draft'
    const res = await registerForTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/registration/i);
  });

  it("rejects for team-entrant competitions", async () => {
    // Even though the league is in draft, flip it to registration_open
    // to isolate the team-entrant rejection.
    await updateCompetitionStatus("comp-league-draft-1", "registration_open");
    signInAs("mock-member-1");
    const res = await registerForTournamentAction("comp-league-draft-1");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/team/i);
  });

  it("rejects anonymous caller", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    const res = await registerForTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/sign/i);
  });

  it("rejects staff (only members can self-register)", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-staff-1");
    const res = await registerForTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/member/i);
  });

  it("rejects double-registration (uniqueness)", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-member-1");
    // mock-member-row-1 is ALREADY an entrant from the seed (comp-entrant-t1-1)
    const res = await registerForTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already/i);
  });
});

describe("withdrawFromTournamentAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("deletes entrant during registration_open", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-member-1");
    const res = await withdrawFromTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(true);
    const after = await listEntrants(TOURNAMENT_ID);
    expect(
      after.some((e) => e.entrant_member_id === "mock-member-row-1")
    ).toBe(false);
  });

  it("rejects when not registered", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    // owner/staff don't have a member row
    signInAs("mock-owner-1");
    const res = await withdrawFromTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
  });

  it("rejects when competition is completed", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "completed");
    signInAs("mock-member-1");
    const res = await withdrawFromTournamentAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/ended/i);
  });
});
