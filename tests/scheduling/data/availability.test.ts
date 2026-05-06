import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAvailability,
  getAvailabilityForUser,
  replaceAvailability,
} from "@/scheduling/data/availability";
import { weekStartFor } from "@/scheduling/lib/materialize";
import { todaySGT } from "@/lib/timezone";
import { resetMockData } from "../../helpers/reset-mock-data";

describe("availability data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  it("returns seeded blocks for Pat in the current week", async () => {
    const ws = weekStartFor(todaySGT());
    const blocks = await getAvailabilityForUser("mock-staff-row-4", ws);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((b) => b.user_id === "mock-staff-row-4")).toBe(true);
  });

  it("replaceAvailability swaps in new blocks", async () => {
    const ws = "2026-05-04";
    const r = await replaceAvailability("mock-staff-row-4", ws, [
      { day_of_week: 0, start_time: "10:00:00", end_time: "14:00:00" },
    ]);
    expect(r.success).toBe(true);
    const after = await getAvailabilityForUser("mock-staff-row-4", ws);
    expect(after).toHaveLength(1);
    expect(after[0].start_time).toBe("10:00:00");
  });

  it("rejects end<=start", async () => {
    const r = await replaceAvailability("mock-staff-row-4", "2026-05-04", [
      { day_of_week: 0, start_time: "14:00:00", end_time: "10:00:00" },
    ]);
    expect(r.success).toBe(false);
  });

  it("clearAvailability wipes blocks for the week", async () => {
    const ws = weekStartFor(todaySGT());
    const r = await clearAvailability("mock-staff-row-4", ws);
    expect(r.success).toBe(true);
    const after = await getAvailabilityForUser("mock-staff-row-4", ws);
    expect(after).toHaveLength(0);
  });
});
