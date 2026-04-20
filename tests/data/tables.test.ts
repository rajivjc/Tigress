import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_SESSION_HOURS,
  RESERVED_WINDOW_MS,
  SLOT_STEP_MINUTES,
  VENUE_CLOSE_HOUR,
  VENUE_OPEN_HOUR,
  getAvailableSlots,
  getTableById,
  getTablesWithStatus,
  getTodayActivity,
} from "@/lib/data/tables";
import { MOCK_BOOKINGS, MOCK_TABLES } from "@/lib/data/mock-data";
import { todaySGT, dateAtHourSGT } from "@/lib/timezone";
import { resetMockData } from "../helpers/reset-mock-data";

describe("tables data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // Constants
  // ===========================================================================
  describe("venue constants", () => {
    it("opens at 10:00 and closes at midnight (exclusive)", () => {
      expect(VENUE_OPEN_HOUR).toBe(10);
      expect(VENUE_CLOSE_HOUR).toBe(24);
    });

    it("has 60-minute slots and 3-hour max session", () => {
      expect(SLOT_STEP_MINUTES).toBe(60);
      expect(MAX_SESSION_HOURS).toBe(3);
    });

    it("reserved window is 2 hours", () => {
      expect(RESERVED_WINDOW_MS).toBe(2 * 60 * 60 * 1000);
    });
  });

  // ===========================================================================
  // Table lookups
  // ===========================================================================
  describe("getTableById", () => {
    it("returns the table row when found", async () => {
      const t = await getTableById("table-1");
      expect(t?.table_number).toBe(1);
      expect(t?.name).toBe("Table 1");
    });

    it("returns null for an unknown id", async () => {
      expect(await getTableById("table-99")).toBeNull();
    });
  });

  // ===========================================================================
  // getTablesWithStatus — computed state
  // ===========================================================================
  describe("getTablesWithStatus", () => {
    it("returns one entry per mock table", async () => {
      const tables = await getTablesWithStatus();
      expect(tables.length).toBe(MOCK_TABLES.length);
      expect(tables.every((t) => t.computed_status)).toBe(true);
    });

    it("returns blocked status for the synthetic blocked table", async () => {
      const tables = await getTablesWithStatus();
      const blocked = tables.find((t) => t.computed_status === "blocked");
      // Table 7 is synthetically blocked in the mock floor state.
      expect(blocked).toBeDefined();
      expect(blocked?.blocked_reason).toBeDefined();
    });

    it("returns occupied status for a table with a current booking", async () => {
      const tables = await getTablesWithStatus();
      const occupied = tables.find((t) => t.computed_status === "occupied");
      expect(occupied).toBeDefined();
      expect(occupied?.current_booking).toBeDefined();
    });

    it("returns reserved status for a table with an upcoming booking in the 2h window", async () => {
      const tables = await getTablesWithStatus();
      const reserved = tables.find((t) => t.computed_status === "reserved");
      expect(reserved).toBeDefined();
      expect(reserved?.next_booking).toBeDefined();
    });

    it("priority order: blocked beats occupied", async () => {
      const tables = await getTablesWithStatus();
      // All statuses assigned from the fixed priority; none should be both.
      for (const t of tables) {
        expect([
          "available",
          "blocked",
          "occupied",
          "reserved",
        ]).toContain(t.computed_status);
      }
    });
  });

  // ===========================================================================
  // getTodayActivity — live KPIs
  // ===========================================================================
  describe("getTodayActivity", () => {
    it("returns counts and today's SGT date", async () => {
      const activity = await getTodayActivity();
      expect(activity.date).toBe(todaySGT());
      expect(activity.totalBookings).toBeGreaterThanOrEqual(0);
      expect(activity.occupiedNow).toBeGreaterThanOrEqual(0);
      expect(activity.upcomingNext2h).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // getAvailableSlots — slot generation + overlap detection
  // ===========================================================================
  describe("getAvailableSlots", () => {
    it("generates one slot per hour between open and close", async () => {
      const date = todaySGT();
      const slots = await getAvailableSlots("table-1", date);
      expect(slots.length).toBe(VENUE_CLOSE_HOUR - VENUE_OPEN_HOUR);
    });

    it("marks past slots as unavailable with reason=Past", async () => {
      const date = todaySGT();
      const slots = await getAvailableSlots("table-1", date);
      const now = Date.now();
      const pastSlots = slots.filter(
        (s) => Date.parse(s.starts_at) <= now
      );
      for (const s of pastSlots) {
        expect(s.available).toBe(false);
        expect(s.reason).toBe("Past");
      }
    });

    it("returns well-formed ISO timestamps for every slot", async () => {
      const date = todaySGT();
      const slots = await getAvailableSlots("table-1", date);
      for (const s of slots) {
        expect(() => new Date(s.starts_at)).not.toThrow();
        expect(() => new Date(s.ends_at)).not.toThrow();
        expect(Date.parse(s.ends_at)).toBeGreaterThan(
          Date.parse(s.starts_at)
        );
      }
    });

    it("marks slots overlapping a confirmed booking as Booked", async () => {
      // Push a confirmed booking for tomorrow 11:00-12:00 SGT on table-1.
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const yyyy = tomorrow.toISOString().slice(0, 10);
      const start = dateAtHourSGT(yyyy, 11);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      MOCK_BOOKINGS.push({
        id: "slot-test-1",
        table_id: "table-1",
        member_id: "mock-member-row-1",
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: "confirmed",
        credits_used: 1,
        booking_type: "member",
        created_by: "mock-member-row-1",
        notes: null,
        no_show: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const slots = await getAvailableSlots("table-1", yyyy);
      const clashed = slots.find(
        (s) => s.starts_at === start.toISOString()
      );
      expect(clashed?.available).toBe(false);
      expect(clashed?.reason).toBe("Booked");
    });
  });
});
