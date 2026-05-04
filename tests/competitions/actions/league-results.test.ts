import { describe, it, expect, beforeEach } from "vitest";
import { reportSubMatchResultAction } from "@/competitions/actions/league-results";
import { getFixture } from "@/competitions/data/fixtures";
import { getResult } from "@/competitions/data/match-results";
import { getMatch } from "@/competitions/data/matches";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../stubs/next-headers";
import { resetMockData } from "../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

const FIXTURE_3 = "comp-fixture-3"; // in_progress Felt (home, a) vs Cue (away, b)
const FIXTURE_3_S2 = "comp-match-lg-3-s2";
const FIXTURE_3_S3 = "comp-match-lg-3-s3";

describe("reportSubMatchResultAction", () => {
  beforeEach(() => {
    resetMockData();
    signInAs(null);
  });

  it("captain of either side can report", async () => {
    signInAs("mock-member-1"); // Felt Tips captain
    const res = await reportSubMatchResultAction({
      matchId: FIXTURE_3_S2,
      winnerEntrantId: "comp-entrant-sp-felt",
      scoreA: 5,
      scoreB: 3,
    });
    expect(res.success).toBe(true);
    const match = await getMatch(FIXTURE_3_S2);
    expect(match!.status).toBe("completed");
    const result = await getResult(FIXTURE_3_S2);
    expect(result!.winner_entrant_id).toBe("comp-entrant-sp-felt");
  });

  it("staff (not manager+) cannot report", async () => {
    signInAs("mock-staff-1");
    const res = await reportSubMatchResultAction({
      matchId: FIXTURE_3_S2,
      winnerEntrantId: "comp-entrant-sp-felt",
      scoreA: 5,
      scoreB: 3,
    });
    expect(res.success).toBe(false);
  });

  it("manager can report", async () => {
    signInAs("mock-manager-1");
    const res = await reportSubMatchResultAction({
      matchId: FIXTURE_3_S2,
      winnerEntrantId: "comp-entrant-sp-cue",
      scoreA: 2,
      scoreB: 5,
    });
    expect(res.success).toBe(true);
  });

  it("fixture auto-completes when all sub-matches done", async () => {
    signInAs("mock-manager-1");
    // s1 is already completed (seeded). Report s2 and s3 → fixture completes.
    const r2 = await reportSubMatchResultAction({
      matchId: FIXTURE_3_S2,
      winnerEntrantId: "comp-entrant-sp-felt",
      scoreA: 5,
      scoreB: 1,
    });
    expect(r2.success).toBe(true);
    // Fixture should NOT be complete yet (s3 still scheduled).
    const mid = await getFixture(FIXTURE_3);
    expect(mid!.status).toBe("in_progress");

    const r3 = await reportSubMatchResultAction({
      matchId: FIXTURE_3_S3,
      winnerEntrantId: "comp-entrant-sp-cue",
      scoreA: 3,
      scoreB: 5,
    });
    expect(r3.success).toBe(true);
    expect(r3.fixtureCompleted).toBe(true);
    const fx = await getFixture(FIXTURE_3);
    expect(fx!.status).toBe("completed");
  });

  it("rejects for non-league matches (no fixture_id)", async () => {
    signInAs("mock-manager-1");
    // A tournament match — no fixture_id.
    const res = await reportSubMatchResultAction({
      matchId: "comp-match-ip-r2-1",
      winnerEntrantId: "comp-entrant-ip-1",
      scoreA: 5,
      scoreB: 3,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/fixture/i);
  });

  it("winner must be one of the two entrants", async () => {
    signInAs("mock-manager-1");
    const res = await reportSubMatchResultAction({
      matchId: FIXTURE_3_S2,
      winnerEntrantId: "comp-entrant-sp-break", // not on fixture 3
      scoreA: 5,
      scoreB: 3,
    });
    expect(res.success).toBe(false);
  });

  it("winner must reach race-to", async () => {
    signInAs("mock-manager-1");
    const res = await reportSubMatchResultAction({
      matchId: FIXTURE_3_S2,
      winnerEntrantId: "comp-entrant-sp-felt",
      scoreA: 3,
      scoreB: 2,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/race-to/i);
  });
});
