import { describe, it, expect, beforeEach } from "vitest";
import {
  advanceWinner,
  clearBracket,
  listBracketMatches,
  persistBracket,
  revertAdvance,
} from "@/competitions/data/bracket";
import { recordResult } from "@/competitions/data/match-results";
import { listEntrants } from "@/competitions/data/entrants";
import { resetMockData } from "../../helpers/reset-mock-data";

const TOURNAMENT_ID = "comp-tournament-draft-1";

async function seededFromEntrants() {
  const entrants = await listEntrants(TOURNAMENT_ID);
  return entrants
    .filter((e) => e.seed_number !== null)
    .map((e) => ({
      entrantId: e.id,
      seedNumber: e.seed_number as number,
    }));
}

describe("bracket data layer — persistBracket", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("creates one match per bracket match spec (4-entrant = 3 matches)", async () => {
    const seeded = await seededFromEntrants();
    expect(seeded).toHaveLength(4);
    const res = await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    expect(res.success).toBe(true);
    expect(res.createdCount).toBe(3);

    const matches = await listBracketMatches(TOURNAMENT_ID);
    expect(matches).toHaveLength(3);
    // 2 in round 1, 1 in round 2
    expect(matches.filter((m) => m.round_number === 1)).toHaveLength(2);
    expect(matches.filter((m) => m.round_number === 2)).toHaveLength(1);
  });

  it("round 2 matches are scheduled with null entrants", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const matches = await listBracketMatches(TOURNAMENT_ID);
    const r2 = matches.find((m) => m.round_number === 2)!;
    expect(r2.status).toBe("scheduled");
    expect(r2.entrant_a_id).toBeNull();
    expect(r2.entrant_b_id).toBeNull();
  });

  it("race_to_a and race_to_b both default to the provided race_to", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const matches = await listBracketMatches(TOURNAMENT_ID);
    for (const m of matches) {
      expect(m.race_to_a).toBe(7);
      expect(m.race_to_b).toBe(7);
    }
  });

  it("rejects re-publishing when matches already exist", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const second = await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/already/i);
  });

  it("round 1 walkovers: with 3 seeded entrants, the bye match is completed and propagates", async () => {
    const three = (await seededFromEntrants()).slice(0, 3);
    const res = await persistBracket(TOURNAMENT_ID, three, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    expect(res.success).toBe(true);

    const matches = await listBracketMatches(TOURNAMENT_ID);
    // 2 round-1 matches, 1 round-2. One of the round-1 matches is a
    // walkover (top seed gets the bye).
    const r1 = matches.filter((m) => m.round_number === 1);
    const walkovers = r1.filter((m) => m.is_walkover);
    expect(walkovers).toHaveLength(1);
    expect(walkovers[0]!.status).toBe("completed");

    // Top seed advanced into round 2 (slot a, since R1M1 position 1 is odd).
    const r2 = matches.find((m) => m.round_number === 2)!;
    expect(r2.entrant_a_id).toBe(three[0]!.entrantId);
    expect(r2.entrant_b_id).toBeNull();
  });
});

describe("bracket data layer — advanceWinner", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("propagates the winner into the downstream match's slot", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const matches = await listBracketMatches(TOURNAMENT_ID);
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    await recordResult({
      match_id: r1m1.id,
      winner_entrant_id: r1m1.entrant_a_id!,
      score_a: 7,
      score_b: 3,
      reported_by_auth_user_id: null,
    });
    const adv = await advanceWinner(r1m1.id);
    expect(adv.success).toBe(true);
    expect(adv.nextMatchId).not.toBeNull();

    const after = await listBracketMatches(TOURNAMENT_ID);
    const r2 = after.find((m) => m.round_number === 2)!;
    // R1M1 is position 1 (odd) → slot a in the final
    expect(r2.entrant_a_id).toBe(r1m1.entrant_a_id);
  });

  it("returns null nextMatchId for the final (no downstream)", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const matches = await listBracketMatches(TOURNAMENT_ID);
    // Play round 1 so round 2 (the final) has both entrants.
    for (const r1m of matches.filter((m) => m.round_number === 1)) {
      await recordResult({
        match_id: r1m.id,
        winner_entrant_id: r1m.entrant_a_id!,
        score_a: 7,
        score_b: 0,
        reported_by_auth_user_id: null,
      });
      await advanceWinner(r1m.id);
    }
    const r2 = (await listBracketMatches(TOURNAMENT_ID)).find(
      (m) => m.round_number === 2
    )!;
    await recordResult({
      match_id: r2.id,
      winner_entrant_id: r2.entrant_a_id!,
      score_a: 7,
      score_b: 0,
      reported_by_auth_user_id: null,
    });
    const adv = await advanceWinner(r2.id);
    expect(adv.success).toBe(true);
    expect(adv.nextMatchId).toBeNull();
  });

  it("odd-position matches feed slot a, even-position feed slot b", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const matches = await listBracketMatches(TOURNAMENT_ID);
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    const r1m2 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 2
    )!;

    await recordResult({
      match_id: r1m1.id,
      winner_entrant_id: r1m1.entrant_a_id!,
      score_a: 7,
      score_b: 0,
      reported_by_auth_user_id: null,
    });
    await advanceWinner(r1m1.id);

    await recordResult({
      match_id: r1m2.id,
      winner_entrant_id: r1m2.entrant_b_id!,
      score_a: 0,
      score_b: 7,
      reported_by_auth_user_id: null,
    });
    await advanceWinner(r1m2.id);

    const r2 = (await listBracketMatches(TOURNAMENT_ID)).find(
      (m) => m.round_number === 2
    )!;
    expect(r2.entrant_a_id).toBe(r1m1.entrant_a_id);
    expect(r2.entrant_b_id).toBe(r1m2.entrant_b_id);
  });

  it("errors when the match has no result yet", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const matches = await listBracketMatches(TOURNAMENT_ID);
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    const adv = await advanceWinner(r1m1.id);
    expect(adv.success).toBe(false);
    expect(adv.error).toMatch(/result/i);
  });
});

describe("bracket data layer — revertAdvance", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("clears the downstream entrant slot when upstream is cleared", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const matches = await listBracketMatches(TOURNAMENT_ID);
    const r1m1 = matches.find(
      (m) => m.round_number === 1 && m.bracket_position === 1
    )!;
    await recordResult({
      match_id: r1m1.id,
      winner_entrant_id: r1m1.entrant_a_id!,
      score_a: 7,
      score_b: 0,
      reported_by_auth_user_id: null,
    });
    await advanceWinner(r1m1.id);

    const revert = await revertAdvance(r1m1.id);
    expect(revert.success).toBe(true);
    const after = await listBracketMatches(TOURNAMENT_ID);
    const r2 = after.find((m) => m.round_number === 2)!;
    expect(r2.entrant_a_id).toBeNull();
  });
});

describe("bracket data layer — clearBracket", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("removes all matches (and their results) for a competition", async () => {
    const seeded = await seededFromEntrants();
    await persistBracket(TOURNAMENT_ID, seeded, {
      gameTypeId: "nine_ball",
      defaultRaceTo: 7,
    });
    const clr = await clearBracket(TOURNAMENT_ID);
    expect(clr.success).toBe(true);
    expect(clr.removedCount).toBeGreaterThan(0);
    const after = await listBracketMatches(TOURNAMENT_ID);
    expect(after).toHaveLength(0);
  });

  it("is a no-op when no matches exist", async () => {
    const clr = await clearBracket(TOURNAMENT_ID);
    expect(clr.success).toBe(true);
    expect(clr.removedCount).toBe(0);
  });
});
