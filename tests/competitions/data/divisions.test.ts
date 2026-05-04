import { describe, it, expect, beforeEach } from "vitest";
import {
  createDivision,
  deleteDivision,
  findDivisionsByTiers,
  getDivision,
  listDivisions,
} from "@/competitions/data/divisions";
import { resetMockData } from "../../helpers/reset-mock-data";

const SPRING = "comp-season-spring-2026";

describe("divisions data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds four divisions across two seasons", async () => {
    const all = await listDivisions();
    expect(all.length).toBe(4);
  });

  it("filters by seasonId", async () => {
    const spring = await listDivisions({ seasonId: SPRING });
    expect(spring.length).toBe(2);
    expect(spring.every((d) => d.season_id === SPRING)).toBe(true);
  });

  it("creates a new division", async () => {
    const res = await createDivision({
      season_id: SPRING,
      league_name: "Wednesday Night",
      tier: 3,
      tier_name: "Division 2",
    });
    expect(res.success).toBe(true);
    const row = await getDivision(res.id!);
    expect(row!.tier).toBe(3);
  });

  it("rejects duplicate (season, league_name, tier)", async () => {
    const res = await createDivision({
      season_id: SPRING,
      league_name: "Wednesday Night",
      tier: 1,
      tier_name: "Premier",
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/already/i);
  });

  it("rejects tier out of range", async () => {
    const res = await createDivision({
      season_id: SPRING,
      league_name: "Wednesday Night",
      tier: 11,
      tier_name: "Too deep",
    });
    expect(res.success).toBe(false);
  });

  it("rejects missing season", async () => {
    const res = await createDivision({
      season_id: "nonexistent",
      league_name: "Wednesday Night",
      tier: 4,
      tier_name: "Division 3",
    });
    expect(res.success).toBe(false);
  });

  it("deleteDivision refuses if a competition references it", async () => {
    // Seeded division "comp-division-spring-premier" has a league.
    const res = await deleteDivision("comp-division-spring-premier");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/reference/i);
  });

  it("deleteDivision succeeds for unreferenced division", async () => {
    const created = await createDivision({
      season_id: SPRING,
      league_name: "Friday Night",
      tier: 1,
      tier_name: "Premier",
    });
    const res = await deleteDivision(created.id!);
    expect(res.success).toBe(true);
    const still = await getDivision(created.id!);
    expect(still).toBeNull();
  });

  it("findDivisionsByTiers returns matching divisions keyed by tier", async () => {
    const map = await findDivisionsByTiers({
      season_id: SPRING,
      league_name: "Wednesday Night",
      tiers: [1, 2],
    });
    expect(map.size).toBe(2);
    expect(map.get(1)?.tier).toBe(1);
    expect(map.get(1)?.id).toBe("comp-division-spring-premier");
    expect(map.get(2)?.tier).toBe(2);
    expect(map.get(2)?.id).toBe("comp-division-spring-div1");
  });

  it("findDivisionsByTiers omits tiers that don't exist", async () => {
    const map = await findDivisionsByTiers({
      season_id: SPRING,
      league_name: "Wednesday Night",
      tiers: [1, 99],
    });
    expect(map.size).toBe(1);
    expect(map.get(1)?.tier).toBe(1);
    expect(map.has(99)).toBe(false);
  });
});
