import { describe, it, expect, beforeEach } from "vitest";
import {
  createMatch,
  getMatch,
  linkBooking,
  listChildMatches,
  listMatches,
} from "@/competitions/data/matches";
import { resetMockData } from "../../helpers/reset-mock-data";

async function entrantPair() {
  const { listEntrants } = await import("@/competitions/data/entrants");
  const ents = await listEntrants("comp-tournament-draft-1");
  return { a: ents[0]!, b: ents[1]!, competitionId: "comp-tournament-draft-1" };
}

describe("competitions matches data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("creates a match between two entrants", async () => {
    const { a, b, competitionId } = await entrantPair();
    const res = await createMatch({
      competition_id: competitionId,
      entrant_a_id: a.id,
      entrant_b_id: b.id,
      game_type_id: "nine_ball",
      race_to_a: 7,
      race_to_b: 7,
    });
    expect(res.success).toBe(true);
    const row = await getMatch(res.id!);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("scheduled");
  });

  it("rejects a match with the same entrant on both sides", async () => {
    const { a, competitionId } = await entrantPair();
    const res = await createMatch({
      competition_id: competitionId,
      entrant_a_id: a.id,
      entrant_b_id: a.id,
      game_type_id: "nine_ball",
      race_to_a: 7,
      race_to_b: 7,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/distinct/i);
  });

  it("rejects race-to values out of range", async () => {
    const { a, b, competitionId } = await entrantPair();
    const res = await createMatch({
      competition_id: competitionId,
      entrant_a_id: a.id,
      entrant_b_id: b.id,
      game_type_id: "nine_ball",
      race_to_a: 0,
      race_to_b: 7,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/race_to/i);
  });

  it("links a booking to a match", async () => {
    const { a, b, competitionId } = await entrantPair();
    const created = await createMatch({
      competition_id: competitionId,
      entrant_a_id: a.id,
      entrant_b_id: b.id,
      game_type_id: "nine_ball",
      race_to_a: 7,
      race_to_b: 7,
    });
    const res = await linkBooking(created.id!, "booking-1");
    expect(res.success).toBe(true);
    const row = await getMatch(created.id!);
    expect(row!.booking_id).toBe("booking-1");
  });

  it("parent/child linkage surfaces via listChildMatches", async () => {
    const { a, b, competitionId } = await entrantPair();
    const parent = await createMatch({
      competition_id: competitionId,
      entrant_a_id: a.id,
      entrant_b_id: b.id,
      game_type_id: "nine_ball",
      race_to_a: 7,
      race_to_b: 7,
    });
    const child = await createMatch({
      competition_id: competitionId,
      entrant_a_id: a.id,
      entrant_b_id: b.id,
      game_type_id: "nine_ball",
      race_to_a: 5,
      race_to_b: 5,
      parent_match_id: parent.id,
    });
    expect(child.success).toBe(true);
    const children = await listChildMatches(parent.id!);
    expect(children.length).toBe(1);
    expect(children[0]!.id).toBe(child.id);
    // Top-level listMatches includes both.
    const all = await listMatches({ competitionId });
    expect(all.length).toBe(2);
  });
});
