import { beforeEach, describe, expect, it } from "vitest";
import {
  getQualificationsForUser,
  listAllQualifications,
  setUserQualifications,
} from "@/scheduling/data/qualifications";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("qualifications data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("seeds all three quals for FT staff", async () => {
    const sam = await getQualificationsForUser("mock-staff-row-1");
    expect(sam.sort()).toEqual(["bartender", "floor", "mod"]);
  });

  it("seeds bartender for Pat (PT)", async () => {
    const pat = await getQualificationsForUser("mock-staff-row-4");
    expect(pat).toEqual(["bartender"]);
  });

  it("replaces qualifications atomically", async () => {
    const r = await setUserQualifications("mock-staff-row-1", ["mod"]);
    expect(r.success).toBe(true);
    const after = await getQualificationsForUser("mock-staff-row-1");
    expect(after).toEqual(["mod"]);
  });

  it("strips unknown qualifications", async () => {
    // @ts-expect-error - testing runtime guard against bad inputs
    await setUserQualifications("mock-staff-row-1", ["mod", "bogus"]);
    const after = await getQualificationsForUser("mock-staff-row-1");
    expect(after).toEqual(["mod"]);
  });

  it("listAllQualifications returns every row", async () => {
    const all = await listAllQualifications();
    expect(all.length).toBeGreaterThanOrEqual(11);
  });
});
