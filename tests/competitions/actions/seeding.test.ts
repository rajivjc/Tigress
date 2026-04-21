import { describe, it, expect, beforeEach } from "vitest";
import {
  randomSeedAction,
  setSeedingAction,
} from "@/competitions/actions/seeding";
import { listEntrants } from "@/competitions/data/entrants";
import { updateCompetitionStatus } from "@/competitions/data/competitions";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const TOURNAMENT_ID = "comp-tournament-draft-1";

describe("setSeedingAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("manager/owner can update seeding while registration is open", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-owner-1");
    const entrants = await listEntrants(TOURNAMENT_ID);
    // Reverse the existing seeding.
    const res = await setSeedingAction(
      TOURNAMENT_ID,
      entrants.map((e, i) => ({
        entrantId: e.id,
        seedNumber: entrants.length - i,
      }))
    );
    expect(res.success).toBe(true);
    const after = await listEntrants(TOURNAMENT_ID);
    // listEntrants sorts seed-ascending, so after[0] has seed 1 — but the
    // originally first entrant has been pushed to seed N.
    const firstOriginal = after.find((e) => e.id === entrants[0]!.id)!;
    expect(firstOriginal.seed_number).toBe(entrants.length);
    const seeds = after.map((e) => e.seed_number).sort((a, b) => a! - b!);
    expect(seeds).toEqual([1, 2, 3, 4]);
  });

  it("rejects non-manager callers", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-staff-1");
    const res = await setSeedingAction(TOURNAMENT_ID, []);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/manager/i);
  });

  it("rejects when competition is in_progress", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "in_progress");
    signInAs("mock-owner-1");
    const entrants = await listEntrants(TOURNAMENT_ID);
    const res = await setSeedingAction(
      TOURNAMENT_ID,
      entrants.map((e, i) => ({ entrantId: e.id, seedNumber: i + 1 }))
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/registration/i);
  });
});

describe("randomSeedAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("assigns a contiguous 1..N seeding", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-owner-1");
    const res = await randomSeedAction(TOURNAMENT_ID);
    expect(res.success).toBe(true);
    const after = await listEntrants(TOURNAMENT_ID);
    const seeds = after
      .map((e) => e.seed_number!)
      .sort((a, b) => a - b);
    expect(seeds).toEqual([1, 2, 3, 4]);
  });

  it("rejects non-manager callers", async () => {
    await updateCompetitionStatus(TOURNAMENT_ID, "registration_open");
    signInAs("mock-staff-1");
    const res = await randomSeedAction(TOURNAMENT_ID);
    expect(res.success).toBe(false);
  });
});
