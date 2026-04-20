import { describe, it, expect, beforeEach } from "vitest";
import {
  getSkillLevel,
  listSkillLevels,
  setSkillLevel,
} from "@/competitions/data/skills";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("competitions skills data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("returns the seeded skill level for Mona", async () => {
    const lvl = await getSkillLevel("mock-member-row-1");
    expect(lvl).toBe(5);
  });

  it("returns null for a member without a skill record", async () => {
    const lvl = await getSkillLevel("no-such-member");
    expect(lvl).toBeNull();
  });

  it("setSkillLevel upserts", async () => {
    const res = await setSkillLevel("mock-member-row-1", 8, "mock-staff-row-2");
    expect(res.success).toBe(true);
    const lvl = await getSkillLevel("mock-member-row-1");
    expect(lvl).toBe(8);
  });

  it("rejects out-of-range levels", async () => {
    expect((await setSkillLevel("mock-member-row-1", 0, null)).success).toBe(false);
    expect((await setSkillLevel("mock-member-row-1", 11, null)).success).toBe(false);
    expect((await setSkillLevel("mock-member-row-1", 5.5, null)).success).toBe(false);
  });

  it("listSkillLevels returns all rows", async () => {
    const all = await listSkillLevels();
    expect(all.length).toBeGreaterThanOrEqual(4);
  });
});
