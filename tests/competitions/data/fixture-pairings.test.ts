import { describe, it, expect, beforeEach } from "vitest";
import {
  createPairings,
  deletePairingsByFixture,
  listPairingsByFixture,
} from "@/competitions/data/fixture-pairings";
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
});
