import { describe, it, expect, beforeEach } from "vitest";
import {
  getNoShowCountForMember,
  getNoShowHistoryForMember,
  markNoShow,
  unmarkNoShow,
} from "@/lib/data/bookings";
import { MOCK_BOOKINGS } from "@/lib/data/mock-data";
import type { Booking } from "@/lib/types";
import { resetMockData } from "../helpers/reset-mock-data";

const MEMBER_ID = "mock-member-row-1";
const STAFF_ID = "mock-staff-1";

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function pushBooking(overrides: Partial<Booking>): string {
  const id = overrides.id ?? `no-show-test-${MOCK_BOOKINGS.length + 1}`;
  const now = new Date().toISOString();
  MOCK_BOOKINGS.push({
    id,
    table_id: "table-7",
    member_id: MEMBER_ID,
    starts_at: hoursFromNow(-3),
    ends_at: hoursFromNow(-1),
    status: "completed",
    credits_used: 1,
    booking_type: "member",
    created_by: MEMBER_ID,
    notes: null,
    no_show: false,
    reminder_sent_at: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  });
  return id;
}

describe("no-show data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // markNoShow
  // ===========================================================================
  describe("markNoShow", () => {
    it("flips a completed booking to no_show=true", async () => {
      const id = pushBooking({});
      const res = await markNoShow(id, STAFF_ID);
      expect(res.success).toBe(true);
      const row = MOCK_BOOKINGS.find((b) => b.id === id)!;
      expect(row.no_show).toBe(true);
    });

    it("rejects a confirmed (not yet completed) booking", async () => {
      const id = pushBooking({
        status: "confirmed",
        starts_at: hoursFromNow(2),
        ends_at: hoursFromNow(4),
      });
      const res = await markNoShow(id, STAFF_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only completed/i);
      expect(MOCK_BOOKINGS.find((b) => b.id === id)!.no_show).toBe(false);
    });

    it("rejects a cancelled booking", async () => {
      const id = pushBooking({ status: "cancelled" });
      const res = await markNoShow(id, STAFF_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only completed/i);
    });

    it("returns an error for an unknown booking id", async () => {
      const res = await markNoShow("does-not-exist", STAFF_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    it("is idempotent — marking twice still succeeds", async () => {
      const id = pushBooking({ no_show: true });
      const res = await markNoShow(id, STAFF_ID);
      expect(res.success).toBe(true);
      expect(MOCK_BOOKINGS.find((b) => b.id === id)!.no_show).toBe(true);
    });
  });

  // ===========================================================================
  // unmarkNoShow
  // ===========================================================================
  describe("unmarkNoShow", () => {
    it("clears no_show on a flagged booking", async () => {
      const id = pushBooking({ no_show: true });
      const res = await unmarkNoShow(id, STAFF_ID);
      expect(res.success).toBe(true);
      expect(MOCK_BOOKINGS.find((b) => b.id === id)!.no_show).toBe(false);
    });

    it("rejects a booking that isn't marked", async () => {
      const id = pushBooking({ no_show: false });
      const res = await unmarkNoShow(id, STAFF_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not marked/i);
    });

    it("rejects a non-completed booking", async () => {
      const id = pushBooking({
        status: "confirmed",
        no_show: true, // would normally never happen, but exercise the guard
        starts_at: hoursFromNow(2),
        ends_at: hoursFromNow(4),
      });
      const res = await unmarkNoShow(id, STAFF_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only completed/i);
    });

    it("returns an error for an unknown booking id", async () => {
      const res = await unmarkNoShow("does-not-exist", STAFF_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  // ===========================================================================
  // getNoShowCountForMember
  // ===========================================================================
  describe("getNoShowCountForMember", () => {
    it("returns 0 when the member has no no-shows", async () => {
      const count = await getNoShowCountForMember(MEMBER_ID);
      expect(count).toBe(0);
    });

    it("counts a single no-show", async () => {
      pushBooking({ no_show: true });
      const count = await getNoShowCountForMember(MEMBER_ID);
      expect(count).toBe(1);
    });

    it("counts multiple no-shows for the same member", async () => {
      pushBooking({ id: "no-show-a", no_show: true });
      pushBooking({ id: "no-show-b", no_show: true });
      pushBooking({ id: "no-show-c", no_show: true });
      pushBooking({ id: "no-show-not-flagged", no_show: false });
      const count = await getNoShowCountForMember(MEMBER_ID);
      expect(count).toBe(3);
    });

    it("does not count no-shows for other members", async () => {
      pushBooking({ no_show: true, member_id: "mock-member-row-2" });
      const count = await getNoShowCountForMember(MEMBER_ID);
      expect(count).toBe(0);
    });
  });

  // ===========================================================================
  // getNoShowHistoryForMember
  // ===========================================================================
  describe("getNoShowHistoryForMember", () => {
    it("returns only no-show bookings", async () => {
      pushBooking({ id: "h-yes", no_show: true });
      pushBooking({ id: "h-no", no_show: false });
      const rows = await getNoShowHistoryForMember(MEMBER_ID);
      expect(rows.map((r) => r.id)).toContain("h-yes");
      expect(rows.map((r) => r.id)).not.toContain("h-no");
      for (const r of rows) {
        expect(r.no_show).toBe(true);
        expect(r.member_id).toBe(MEMBER_ID);
      }
    });

    it("orders by starts_at descending", async () => {
      pushBooking({
        id: "older",
        no_show: true,
        starts_at: hoursFromNow(-100),
        ends_at: hoursFromNow(-99),
      });
      pushBooking({
        id: "newer",
        no_show: true,
        starts_at: hoursFromNow(-10),
        ends_at: hoursFromNow(-9),
      });
      const rows = await getNoShowHistoryForMember(MEMBER_ID);
      const ids = rows.map((r) => r.id);
      expect(ids.indexOf("newer")).toBeLessThan(ids.indexOf("older"));
    });

    it("returns an empty array when there are no no-shows", async () => {
      const rows = await getNoShowHistoryForMember(MEMBER_ID);
      expect(rows).toEqual([]);
    });
  });

  // ===========================================================================
  // Mock booking defaults — sanity check
  // ===========================================================================
  describe("default no_show value", () => {
    it("seeded mock bookings start with no_show=false", () => {
      for (const b of MOCK_BOOKINGS) {
        expect(b.no_show).toBe(false);
      }
    });
  });
});
