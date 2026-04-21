import { describe, it, expect, beforeEach } from "vitest";
import {
  clearBracketAction,
  publishBracketAction,
} from "@/competitions/actions/bracket";
import { updateCompetitionStatus } from "@/competitions/data/competitions";
import { listBracketMatches } from "@/competitions/data/bracket";
import { removeEntrant, listEntrants } from "@/competitions/data/entrants";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const TOURNAMENT_ID = "comp-tournament-draft-1";

describe("publishBracketAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("publishes a bracket with 4 seeded entrants", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-owner-1");
    const res = await publishBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(true);
    expect(res.createdCount).toBe(3);
    const matches = await listBracketMatches(TOURNAMENT_ID);
    expect(matches).toHaveLength(3);
  });

  it("rejects when fewer than 2 active entrants", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    const entrants = await listEntrants(TOURNAMENT_ID);
    // Remove 3 entrants, leaving only 1.
    for (const e of entrants.slice(1)) {
      await removeEntrant(e.id);
    }
    signInAs("mock-owner-1");
    const res = await publishBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/2/);
  });

  it("rejects when status is not registration_open", async () => {
    // Default status is draft.
    signInAs("mock-owner-1");
    const res = await publishBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/registration/i);
  });

  it("rejects non-manager callers", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-staff-1");
    const res = await publishBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });

  it("auto-seeds when entrants are missing seeds", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    // Clear all seeds.
    const { setSeedNumbers } = await import("@/competitions/data/entrants");
    const entrants = await listEntrants(TOURNAMENT_ID);
    const clear: Record<string, number | null> = {};
    for (const e of entrants) clear[e.id] = null;
    await setSeedNumbers(TOURNAMENT_ID, clear);

    signInAs("mock-owner-1");
    const res = await publishBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(true);

    const after = await listEntrants(TOURNAMENT_ID);
    const seeds = after.map((e) => e.seed_number).filter((s) => s !== null);
    // Every active entrant should now have a seed
    expect(seeds).toHaveLength(entrants.length);
  });

  it("rejects re-publishing", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-owner-1");
    const first = await publishBracketAction(TOURNAMENT_ID);
    expect(first.success).toBe(true);
    // Reset status so the status gate doesn't trip first
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    const second = await publishBracketAction(TOURNAMENT_ID);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already/i);
  });
});

describe("clearBracketAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("removes all matches and returns competition to registration_open", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-owner-1");
    await publishBracketAction(TOURNAMENT_ID);
    const before = await listBracketMatches(TOURNAMENT_ID);
    expect(before.length).toBeGreaterThan(0);

    const res = await clearBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(true);
    const after = await listBracketMatches(TOURNAMENT_ID);
    expect(after).toHaveLength(0);
  });

  it("rejects when competition is completed", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "completed");
    signInAs("mock-owner-1");
    const res = await clearBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/completed/i);
  });

  it("rejects non-manager callers", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-staff-1");
    const res = await clearBracketAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });
});
