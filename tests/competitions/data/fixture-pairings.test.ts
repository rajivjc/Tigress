import { describe, it, expect, beforeEach } from "vitest";
import {
  createPairings,
  deletePairingsByFixture,
  listPairingsByFixture,
  listPairingsByFixtureIds,
} from "@/competitions/data/fixture-pairings";
import {
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_LINEUPS,
  MOCK_COMP_MATCH_RESULTS,
} from "@/competitions/data/mock-data";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("fixture-pairings data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("listPairingsByFixture returns empty for an unknown fixture", async () => {
    const rows = await listPairingsByFixture("nonexistent");
    expect(rows).toEqual([]);
  });

  it("createPairings + listPairingsByFixture roundtrip in pairing_order", async () => {
    const res = await createPairings("fx-1", [
      { homeTeamId: "t-a", awayTeamId: "t-b", pairingOrder: 2 },
      { homeTeamId: "t-c", awayTeamId: "t-a", pairingOrder: 1 },
    ]);
    expect(res.success).toBe(true);
    const rows = await listPairingsByFixture("fx-1");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.pairing_order).toBe(1);
    expect(rows[1]!.pairing_order).toBe(2);
  });

  it("createPairings rejects same-team pairings and duplicates", async () => {
    const sameTeam = await createPairings("fx-2", [
      { homeTeamId: "t-a", awayTeamId: "t-a", pairingOrder: 1 },
    ]);
    expect(sameTeam.success).toBe(false);
    const dup = await createPairings("fx-2", [
      { homeTeamId: "t-a", awayTeamId: "t-b", pairingOrder: 1 },
      { homeTeamId: "t-a", awayTeamId: "t-b", pairingOrder: 2 },
    ]);
    expect(dup.success).toBe(false);
  });

  it("deletePairingsByFixture clears one fixture's pairings only", async () => {
    await createPairings("fx-keep", [
      { homeTeamId: "t-a", awayTeamId: "t-b", pairingOrder: 1 },
    ]);
    await createPairings("fx-clear", [
      { homeTeamId: "t-c", awayTeamId: "t-d", pairingOrder: 1 },
      { homeTeamId: "t-e", awayTeamId: "t-f", pairingOrder: 2 },
    ]);
    const del = await deletePairingsByFixture("fx-clear");
    expect(del.success).toBe(true);
    expect(await listPairingsByFixture("fx-clear")).toEqual([]);
    expect(await listPairingsByFixture("fx-keep")).toHaveLength(1);
  });

  it("mock cascade: deleting pairings drops their matches, lineups, and results", async () => {
    const fixtureId = "fx-cascade";
    const created = await createPairings(fixtureId, [
      { homeTeamId: "t-a", awayTeamId: "t-b", pairingOrder: 1 },
    ]);
    expect(created.success).toBe(true);
    const pairingId = created.rows![0]!.id;

    const nowIso = new Date().toISOString();
    const matchId = "match-cascade-1";
    MOCK_COMP_MATCHES.push({
      id: matchId,
      competition_id: "comp-cascade",
      entrant_a_id: "ent-a",
      entrant_b_id: "ent-b",
      game_type_id: "eight_ball",
      race_to_a: 5,
      race_to_b: 5,
      round_number: null,
      bracket_position: null,
      parent_match_id: null,
      fixture_id: fixtureId,
      pairing_id: pairingId,
      scheduled_at: null,
      booking_id: null,
      status: "scheduled",
      is_walkover: false,
      created_at: nowIso,
      updated_at: nowIso,
    });
    MOCK_COMP_MATCH_LINEUPS.push({
      match_id: matchId,
      entrant_id: "ent-a",
      member_id: "mock-member-row-1",
      side: "a",
      recorded_at: nowIso,
      approval_status: "not_required",
      approved_by_member_id: null,
      approved_at: null,
      approval_note: null,
    });
    MOCK_COMP_MATCH_RESULTS.push({
      match_id: matchId,
      winner_entrant_id: "ent-a",
      score_a: 5,
      score_b: 3,
      broken_by_entrant_id: null,
      flags: {},
      reported_by_auth_user_id: null,
      reported_at: nowIso,
      verified_by_staff_id: null,
      verified_at: null,
      notes: null,
    });

    const del = await deletePairingsByFixture(fixtureId);
    expect(del.success).toBe(true);

    expect(MOCK_COMP_MATCHES.find((m) => m.id === matchId)).toBeUndefined();
    expect(
      MOCK_COMP_MATCH_LINEUPS.find((l) => l.match_id === matchId)
    ).toBeUndefined();
    expect(
      MOCK_COMP_MATCH_RESULTS.find((r) => r.match_id === matchId)
    ).toBeUndefined();
  });

  it("listPairingsByFixtureIds returns a map keyed by fixture id", async () => {
    await createPairings("fx-1", [
      { homeTeamId: "t-a", awayTeamId: "t-b", pairingOrder: 2 },
      { homeTeamId: "t-c", awayTeamId: "t-d", pairingOrder: 1 },
    ]);
    await createPairings("fx-2", [
      { homeTeamId: "t-e", awayTeamId: "t-f", pairingOrder: 1 },
      { homeTeamId: "t-g", awayTeamId: "t-h", pairingOrder: 2 },
    ]);
    const map = await listPairingsByFixtureIds(["fx-1", "fx-2"]);
    expect(map.size).toBe(2);
    expect(map.get("fx-1")).toHaveLength(2);
    expect(map.get("fx-2")).toHaveLength(2);
    expect(map.get("fx-1")!.map((p) => p.pairing_order)).toEqual([1, 2]);
    expect(map.get("fx-2")!.map((p) => p.pairing_order)).toEqual([1, 2]);
  });
});
