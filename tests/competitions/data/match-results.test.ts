import { describe, it, expect, beforeEach } from "vitest";
import {
  clearResult,
  getResult,
  recordResult,
  verifyResult,
} from "@/competitions/data/match-results";
import { createMatch } from "@/competitions/data/matches";
import { resetMockData } from "../../helpers/reset-mock-data";

async function createFixtureMatch() {
  const { listEntrants } = await import("@/competitions/data/entrants");
  const ents = await listEntrants("comp-tournament-draft-1");
  const m = await createMatch({
    competition_id: "comp-tournament-draft-1",
    entrant_a_id: ents[0]!.id,
    entrant_b_id: ents[1]!.id,
    game_type_id: "nine_ball",
    race_to_a: 7,
    race_to_b: 7,
  });
  return {
    matchId: m.id!,
    aEntrantId: ents[0]!.id,
    bEntrantId: ents[1]!.id,
  };
}

describe("competitions match results data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("records a result and exposes it via getResult", async () => {
    const { matchId, aEntrantId } = await createFixtureMatch();
    const res = await recordResult({
      match_id: matchId,
      winner_entrant_id: aEntrantId,
      score_a: 7,
      score_b: 5,
      reported_by_auth_user_id: "mock-manager-1",
    });
    expect(res.success).toBe(true);
    const row = await getResult(matchId);
    expect(row).not.toBeNull();
    expect(row!.winner_entrant_id).toBe(aEntrantId);
    expect(row!.score_a).toBe(7);
  });

  it("rejects a winner that isn't part of the match", async () => {
    const { matchId } = await createFixtureMatch();
    const res = await recordResult({
      match_id: matchId,
      winner_entrant_id: "not-an-entrant",
      score_a: 7,
      score_b: 5,
      reported_by_auth_user_id: null,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/winner/i);
  });

  it("rejects negative scores", async () => {
    const { matchId, aEntrantId } = await createFixtureMatch();
    const res = await recordResult({
      match_id: matchId,
      winner_entrant_id: aEntrantId,
      score_a: -1,
      score_b: 5,
      reported_by_auth_user_id: null,
    });
    expect(res.success).toBe(false);
  });

  it("verify then clear cycles cleanly", async () => {
    const { matchId, aEntrantId } = await createFixtureMatch();
    await recordResult({
      match_id: matchId,
      winner_entrant_id: aEntrantId,
      score_a: 7,
      score_b: 5,
      reported_by_auth_user_id: null,
    });
    const ver = await verifyResult(matchId, "mock-staff-row-2");
    expect(ver.success).toBe(true);
    const verified = await getResult(matchId);
    expect(verified!.verified_by_staff_id).toBe("mock-staff-row-2");

    const clr = await clearResult(matchId);
    expect(clr.success).toBe(true);
    const cleared = await getResult(matchId);
    expect(cleared).toBeNull();
  });
});
