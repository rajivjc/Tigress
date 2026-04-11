import { describe, it, expect, beforeEach } from "vitest";
import {
  createRateCardEntry,
  createTier,
  deleteRateCardEntry,
  getAllRateCardEntries,
  toggleRateCardEntry,
  updateRateCardEntry,
  updateTier,
} from "@/lib/data/settings";
import { MOCK_TIERS } from "@/lib/data/mock-data";
import { resetMockData } from "../helpers/reset-mock-data";

describe("settings data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // Tiers — update / create
  // ===========================================================================
  describe("updateTier", () => {
    it("no-ops on empty patch", async () => {
      const res = await updateTier("tier-standard", {});
      expect(res.success).toBe(true);
    });

    it("rejects an unknown tier id", async () => {
      const res = await updateTier("nope", { name: "x" });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    it("rejects negative numeric fields", async () => {
      const res = await updateTier("tier-standard", {
        monthly_price_cents: -1,
      });
      expect(res.success).toBe(false);
    });

    it("rejects non-numeric values on numeric fields", async () => {
      const res = await updateTier("tier-standard", {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        credits_per_month: "five" as unknown as number,
      });
      expect(res.success).toBe(false);
    });

    it("applies valid patches in place", async () => {
      const res = await updateTier("tier-standard", {
        monthly_price_cents: 12345,
        credits_per_month: 6,
        priority_booking_days: 5,
        guest_passes_per_month: 2,
      });
      expect(res.success).toBe(true);
      const row = MOCK_TIERS.find((t) => t.id === "tier-standard")!;
      expect(row.monthly_price_cents).toBe(12345);
      expect(row.credits_per_month).toBe(6);
      expect(row.priority_booking_days).toBe(5);
      expect(row.guest_passes_per_month).toBe(2);
    });
  });

  describe("createTier", () => {
    it("rejects a blank name", async () => {
      const res = await createTier({ name: "  " });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/name/i);
    });

    it("appends a new tier and returns the id", async () => {
      const before = MOCK_TIERS.length;
      const res = await createTier({
        name: "Bronze",
        monthly_price_cents: 5000,
        credits_per_month: 2,
        priority_booking_days: 1,
        guest_passes_per_month: 0,
      });
      expect(res.success).toBe(true);
      expect(res.tierId).toBeDefined();
      expect(MOCK_TIERS.length).toBe(before + 1);
    });

    it("applies defaults for missing numeric fields", async () => {
      const res = await createTier({ name: "Default Tier" });
      expect(res.success).toBe(true);
      const created = MOCK_TIERS.find((t) => t.id === res.tierId)!;
      expect(created.monthly_price_cents).toBe(0);
      expect(created.credits_per_month).toBe(0);
      expect(created.priority_booking_days).toBe(3);
    });
  });

  // ===========================================================================
  // Rate card — CRUD + toggle
  // ===========================================================================
  describe("rate card", () => {
    it("lists the seeded rate card sorted by sort_order", async () => {
      const rows = await getAllRateCardEntries();
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.sort_order).toBeGreaterThanOrEqual(
          rows[i - 1]!.sort_order
        );
      }
    });

    it("updates an existing entry's label", async () => {
      const rows = await getAllRateCardEntries();
      const first = rows[0]!;
      const res = await updateRateCardEntry(first.id, {
        label: "New Label",
      });
      expect(res.success).toBe(true);
      const after = await getAllRateCardEntries();
      expect(after.find((r) => r.id === first.id)?.label).toBe("New Label");
    });

    it("creates a new entry with valid input", async () => {
      const res = await createRateCardEntry({
        rate_type: "hourly",
        label: "Weekend Rate",
        amount_cents: 3000,
        description: "Fri-Sun",
      });
      expect(res.success).toBe(true);
      expect(res.rateId).toBeDefined();
      const rows = await getAllRateCardEntries();
      expect(rows.some((r) => r.id === res.rateId)).toBe(true);
    });

    it("rejects creation with a blank label", async () => {
      const res = await createRateCardEntry({
        rate_type: "hourly",
        label: " ",
        amount_cents: 1000,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/label/i);
    });

    it("rejects creation with a negative amount", async () => {
      const res = await createRateCardEntry({
        rate_type: "hourly",
        label: "Foo",
        amount_cents: -1,
      });
      expect(res.success).toBe(false);
    });

    it("toggles an existing entry", async () => {
      const rows = await getAllRateCardEntries();
      const first = rows[0]!;
      await toggleRateCardEntry(first.id, false);
      const after = await getAllRateCardEntries();
      expect(after.find((r) => r.id === first.id)?.is_active).toBe(false);
      await toggleRateCardEntry(first.id, true);
      const afterAgain = await getAllRateCardEntries();
      expect(afterAgain.find((r) => r.id === first.id)?.is_active).toBe(true);
    });

    it("deletes an entry by id", async () => {
      const created = await createRateCardEntry({
        rate_type: "per_person",
        label: "Temp",
        amount_cents: 100,
      });
      const res = await deleteRateCardEntry(created.rateId!);
      expect(res.success).toBe(true);
      const rows = await getAllRateCardEntries();
      expect(rows.some((r) => r.id === created.rateId)).toBe(false);
    });

    it("returns error on deleting an unknown id", async () => {
      const res = await deleteRateCardEntry("nope");
      expect(res.success).toBe(false);
    });
  });
});
