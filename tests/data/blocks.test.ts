import { describe, it, expect, beforeEach } from "vitest";
import {
  _mockBlocksForTesting,
  createBlock,
  deleteActiveBlockForTable,
  deleteBlock,
  isMockTableUnblocked,
} from "@/lib/data/blocks";
import { resetMockData } from "../helpers/reset-mock-data";

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

describe("blocks data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    // Reset in-memory block store by removing all existing blocks.
    const store = _mockBlocksForTesting();
    store.length = 0;
  });

  describe("createBlock validation", () => {
    const staffId = "mock-staff-1";

    it("rejects invalid timestamps", async () => {
      const res = await createBlock({
        table_id: "table-1",
        starts_at: "nope",
        ends_at: "nope",
        reason: "Maintenance",
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid/i);
    });

    it("rejects end <= start", async () => {
      const t = hoursFromNow(10);
      const res = await createBlock({
        table_id: "table-1",
        starts_at: t,
        ends_at: t,
        reason: "Maintenance",
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/after/i);
    });

    it("rejects starts_at in the past", async () => {
      const res = await createBlock({
        table_id: "table-1",
        starts_at: hoursFromNow(-1),
        ends_at: hoursFromNow(1),
        reason: "Maintenance",
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/future/i);
    });

    it("rejects an empty reason", async () => {
      const res = await createBlock({
        table_id: "table-1",
        starts_at: hoursFromNow(10),
        ends_at: hoursFromNow(11),
        reason: "   ",
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/reason/i);
    });
  });

  describe("createBlock mock-mode mutations", () => {
    const staffId = "mock-staff-1";

    it("creates a block and appends to the mock store", async () => {
      const res = await createBlock({
        table_id: "table-2",
        starts_at: hoursFromNow(5),
        ends_at: hoursFromNow(7),
        reason: "Maintenance",
        notes: "Felt recovering",
        created_by: staffId,
      });
      expect(res.success).toBe(true);
      expect(res.block_id).toBeDefined();
      const store = _mockBlocksForTesting();
      expect(store.some((b) => b.id === res.block_id)).toBe(true);
    });

    it("rejects overlapping blocks on the same table", async () => {
      await createBlock({
        table_id: "table-2",
        starts_at: hoursFromNow(5),
        ends_at: hoursFromNow(8),
        reason: "Maintenance",
        created_by: staffId,
      });
      const res = await createBlock({
        table_id: "table-2",
        starts_at: hoursFromNow(6),
        ends_at: hoursFromNow(9),
        reason: "Maintenance",
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/overlap/i);
    });

    it("allows a block on a different table in the same window", async () => {
      await createBlock({
        table_id: "table-2",
        starts_at: hoursFromNow(5),
        ends_at: hoursFromNow(8),
        reason: "Maintenance",
        created_by: staffId,
      });
      const res = await createBlock({
        table_id: "table-3",
        starts_at: hoursFromNow(5),
        ends_at: hoursFromNow(8),
        reason: "Maintenance",
        created_by: staffId,
      });
      expect(res.success).toBe(true);
    });
  });

  describe("deleteBlock", () => {
    const staffId = "mock-staff-1";

    it("removes an existing block by id", async () => {
      const createRes = await createBlock({
        table_id: "table-2",
        starts_at: hoursFromNow(5),
        ends_at: hoursFromNow(7),
        reason: "Maintenance",
        created_by: staffId,
      });
      const res = await deleteBlock(createRes.block_id!);
      expect(res.success).toBe(true);
      const store = _mockBlocksForTesting();
      expect(store.some((b) => b.id === createRes.block_id)).toBe(false);
    });

    it("returns an error for an unknown block id", async () => {
      const res = await deleteBlock("no-such-block");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  describe("deleteActiveBlockForTable", () => {
    const staffId = "mock-staff-1";

    it("marks the table as unblocked (clears demo block) even if no real block exists", async () => {
      const res = await deleteActiveBlockForTable("table-5");
      expect(res.success).toBe(true);
      expect(isMockTableUnblocked("table-5")).toBe(true);
    });

    it("removes an actively running block for the table", async () => {
      await createBlock({
        table_id: "table-6",
        starts_at: hoursFromNow(-1),
        ends_at: hoursFromNow(2),
        reason: "Maintenance",
        created_by: staffId,
      });
      const res = await deleteActiveBlockForTable("table-6");
      // Create's precondition rejects negative starts_at, so the block above
      // never gets created — the table still gets marked unblocked, which is
      // the demo-clearing behaviour that matters.
      expect(res.success).toBe(true);
      expect(isMockTableUnblocked("table-6")).toBe(true);
    });
  });
});
