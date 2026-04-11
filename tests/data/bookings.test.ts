import { describe, it, expect, beforeEach } from "vitest";
import {
  cancelBooking,
  checkSlotAvailability,
  completeExpiredBookings,
  createBooking,
  createWalkIn,
  getBookingById,
  getPastBookings,
  getUpcomingBookings,
} from "@/lib/data/bookings";
import {
  MOCK_BOOKINGS,
  MOCK_MEMBERS,
  MOCK_WALK_IN_GUESTS,
  findMockMemberById,
} from "@/lib/data/mock-data";
import { resetMockData } from "../helpers/reset-mock-data";

const MEMBER_ID = "mock-member-row-1"; // Mona — standard tier, 3 credits
const PREMIUM_ID = "mock-member-row-2"; // Alex — premium tier, 8 credits
const TABLE_ID = "table-3";

// Helpers ------------------------------------------------------------------

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

describe("bookings data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // Upcoming / past / by-id lookups
  // ===========================================================================
  describe("getUpcomingBookings", () => {
    it("returns only future confirmed bookings for the given member", async () => {
      const rows = await getUpcomingBookings(MEMBER_ID, 10);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.booking.member_id).toBe(MEMBER_ID);
        expect(r.booking.status).toBe("confirmed");
        expect(Date.parse(r.booking.starts_at)).toBeGreaterThan(Date.now());
      }
    });

    it("sorts ascending by starts_at", async () => {
      const rows = await getUpcomingBookings(MEMBER_ID, 10);
      for (let i = 1; i < rows.length; i++) {
        expect(
          rows[i]!.booking.starts_at.localeCompare(
            rows[i - 1]!.booking.starts_at
          )
        ).toBeGreaterThanOrEqual(0);
      }
    });

    it("respects the limit parameter", async () => {
      const rows = await getUpcomingBookings(MEMBER_ID, 2);
      expect(rows.length).toBeLessThanOrEqual(2);
    });

    it("enriches each booking with table and owner metadata", async () => {
      const rows = await getUpcomingBookings(MEMBER_ID, 1);
      expect(rows[0]!.table).toMatchObject({ table_number: expect.any(Number) });
      expect(rows[0]!.owner?.id).toBe(MEMBER_ID);
    });

    it("returns an empty array for an unknown member id", async () => {
      const rows = await getUpcomingBookings("does-not-exist");
      expect(rows).toEqual([]);
    });
  });

  describe("getPastBookings", () => {
    it("returns completed / cancelled / past-ended bookings", async () => {
      const rows = await getPastBookings(MEMBER_ID, 10);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        const isPastTime = r.booking.ends_at < new Date().toISOString();
        const isTerminal = ["completed", "cancelled", "no_show"].includes(
          r.booking.status
        );
        expect(isPastTime || isTerminal).toBe(true);
      }
    });

    it("sorts descending by starts_at", async () => {
      const rows = await getPastBookings(MEMBER_ID, 10);
      for (let i = 1; i < rows.length; i++) {
        expect(
          rows[i]!.booking.starts_at.localeCompare(
            rows[i - 1]!.booking.starts_at
          )
        ).toBeLessThanOrEqual(0);
      }
    });
  });

  describe("getBookingById", () => {
    it("resolves an existing booking with relations", async () => {
      const result = await getBookingById("booking-1");
      expect(result).not.toBeNull();
      expect(result?.booking.id).toBe("booking-1");
      expect(result?.table?.id).toBe("table-3");
    });

    it("returns null for an unknown id", async () => {
      const result = await getBookingById("no-such-id");
      expect(result).toBeNull();
    });

    it("resolves invited bookings via allMockBookings", async () => {
      const result = await getBookingById("booking-invited-1");
      expect(result?.booking.id).toBe("booking-invited-1");
    });
  });

  // ===========================================================================
  // Slot availability
  // ===========================================================================
  describe("checkSlotAvailability", () => {
    it("returns available when no overlapping booking/block exists", async () => {
      const res = await checkSlotAvailability(
        "table-7",
        hoursFromNow(200),
        hoursFromNow(201)
      );
      expect(res.available).toBe(true);
    });

    it("reports unavailable when a confirmed booking overlaps", async () => {
      const existing = MOCK_BOOKINGS.find((b) => b.id === "booking-1")!;
      const res = await checkSlotAvailability(
        existing.table_id,
        existing.starts_at,
        existing.ends_at
      );
      expect(res.available).toBe(false);
      expect(res.reason).toMatch(/booking/i);
    });

    it("honours excludeBookingId for editing the same row", async () => {
      const existing = MOCK_BOOKINGS.find((b) => b.id === "booking-1")!;
      const res = await checkSlotAvailability(
        existing.table_id,
        existing.starts_at,
        existing.ends_at,
        existing.id
      );
      expect(res.available).toBe(true);
    });

    it("ignores non-confirmed bookings", async () => {
      const cancelled = MOCK_BOOKINGS.find((b) => b.status === "cancelled");
      expect(cancelled).toBeDefined();
      const res = await checkSlotAvailability(
        cancelled!.table_id,
        cancelled!.starts_at,
        cancelled!.ends_at
      );
      expect(res.available).toBe(true);
    });
  });

  // ===========================================================================
  // createBooking — validation + business rules
  // ===========================================================================
  describe("createBooking validation", () => {
    const okInput = () => ({
      table_id: TABLE_ID,
      member_id: PREMIUM_ID,
      starts_at: hoursFromNow(100),
      ends_at: hoursFromNow(101),
      credits_to_use: 1,
    });

    it("rejects an invalid timestamp", async () => {
      const res = await createBooking({
        ...okInput(),
        starts_at: "not-a-date",
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/invalid/i);
    });

    it("rejects end <= start", async () => {
      const t = hoursFromNow(100);
      const res = await createBooking({
        ...okInput(),
        starts_at: t,
        ends_at: t,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/after/i);
    });

    it("rejects start in the past", async () => {
      const res = await createBooking({
        ...okInput(),
        starts_at: hoursFromNow(-1),
        ends_at: hoursFromNow(1),
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/future/i);
    });

    it("rejects sessions shorter than the 1h minimum", async () => {
      const start = hoursFromNow(50);
      const end = new Date(Date.parse(start) + 30 * 60 * 1000).toISOString();
      const res = await createBooking({
        ...okInput(),
        starts_at: start,
        ends_at: end,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/1 hour/i);
    });

    it("rejects sessions longer than the 3h maximum", async () => {
      const start = hoursFromNow(50);
      const end = new Date(Date.parse(start) + 4 * 60 * 60 * 1000).toISOString();
      const res = await createBooking({
        ...okInput(),
        starts_at: start,
        ends_at: end,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/3 hours/i);
    });

    it("rejects zero or negative credits_to_use", async () => {
      const res = await createBooking({ ...okInput(), credits_to_use: 0 });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/positive/i);
    });
  });

  // ===========================================================================
  // createBooking — business rules in mock mode
  // ===========================================================================
  describe("createBooking mock-mode business rules", () => {
    it("creates a booking and deducts credits in-place", async () => {
      const before = findMockMemberById(PREMIUM_ID)!.credits_remaining;
      const res = await createBooking({
        table_id: "table-7",
        member_id: PREMIUM_ID,
        starts_at: hoursFromNow(50),
        ends_at: hoursFromNow(51),
        credits_to_use: 1,
      });
      expect(res.success).toBe(true);
      expect(res.booking_id).toBeDefined();
      const after = findMockMemberById(PREMIUM_ID)!.credits_remaining;
      expect(after).toBe(before - 1);
      expect(MOCK_BOOKINGS.some((b) => b.id === res.booking_id)).toBe(true);
    });

    it("blocks members whose subscription_status is not active", async () => {
      const member = findMockMemberById(MEMBER_ID)!;
      member.subscription_status = "past_due";
      const res = await createBooking({
        table_id: "table-7",
        member_id: MEMBER_ID,
        starts_at: hoursFromNow(50),
        ends_at: hoursFromNow(51),
        credits_to_use: 1,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not active/i);
    });

    it("rejects insufficient credits without mutating state", async () => {
      const member = findMockMemberById(MEMBER_ID)!;
      member.credits_remaining = 1;
      const res = await createBooking({
        table_id: "table-7",
        member_id: MEMBER_ID,
        starts_at: hoursFromNow(50),
        ends_at: hoursFromNow(53),
        credits_to_use: 3,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/insufficient/i);
      expect(findMockMemberById(MEMBER_ID)!.credits_remaining).toBe(1);
    });

    it("enforces the tier priority_booking_days horizon", async () => {
      // Standard tier = 3 days. Booking 10 days out must fail.
      const res = await createBooking({
        table_id: "table-7",
        member_id: MEMBER_ID,
        starts_at: hoursFromNow(24 * 10),
        ends_at: hoursFromNow(24 * 10 + 1),
        credits_to_use: 1,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/in advance/i);
    });

    it("rejects a slot that overlaps an existing confirmed booking", async () => {
      const existing = MOCK_BOOKINGS.find((b) => b.id === "booking-1")!;
      const res = await createBooking({
        table_id: existing.table_id,
        member_id: PREMIUM_ID,
        starts_at: existing.starts_at,
        ends_at: existing.ends_at,
        credits_to_use: 1,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/overlap|no longer/i);
    });

    it("prevents the same member holding two concurrent confirmed bookings (any table)", async () => {
      const existing = MOCK_BOOKINGS.find(
        (b) => b.member_id === MEMBER_ID && b.status === "confirmed"
      )!;
      // Book a DIFFERENT table in the same window for the same member.
      const res = await createBooking({
        table_id: "table-7",
        member_id: MEMBER_ID,
        starts_at: existing.starts_at,
        ends_at: existing.ends_at,
        credits_to_use: 1,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already have a booking/i);
    });

    it("rejects a member-id that doesn't exist", async () => {
      const res = await createBooking({
        table_id: "table-7",
        member_id: "mock-member-row-999",
        starts_at: hoursFromNow(50),
        ends_at: hoursFromNow(51),
        credits_to_use: 1,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/member not found/i);
    });

    it("rejects an unknown table id", async () => {
      const res = await createBooking({
        table_id: "table-999",
        member_id: PREMIUM_ID,
        starts_at: hoursFromNow(50),
        ends_at: hoursFromNow(51),
        credits_to_use: 1,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/table not found/i);
    });
  });

  // ===========================================================================
  // cancelBooking
  // ===========================================================================
  describe("cancelBooking", () => {
    it("cancels a future confirmed booking and refunds credits", async () => {
      const member = findMockMemberById(MEMBER_ID)!;
      const before = member.credits_remaining;
      const booking = MOCK_BOOKINGS.find(
        (b) =>
          b.member_id === MEMBER_ID &&
          b.status === "confirmed" &&
          b.credits_used > 0
      )!;
      const refund = booking.credits_used;

      const res = await cancelBooking(booking.id, MEMBER_ID);
      expect(res.success).toBe(true);
      expect(booking.status).toBe("cancelled");
      expect(booking.credits_used).toBe(0);
      expect(member.credits_remaining).toBe(before + refund);
    });

    it("rejects cancellation by the wrong member", async () => {
      const booking = MOCK_BOOKINGS.find((b) => b.status === "confirmed")!;
      const res = await cancelBooking(booking.id, PREMIUM_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    it("rejects cancelling an already-cancelled booking", async () => {
      const booking = MOCK_BOOKINGS.find((b) => b.status === "cancelled")!;
      const res = await cancelBooking(booking.id, MEMBER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/only confirmed/i);
    });

    it("rejects cancelling a booking that has already started", async () => {
      // Manufacture an in-progress confirmed booking for Mona.
      MOCK_BOOKINGS.push({
        id: "in-progress-1",
        table_id: "table-7",
        member_id: MEMBER_ID,
        starts_at: hoursFromNow(-1),
        ends_at: hoursFromNow(1),
        status: "confirmed",
        credits_used: 1,
        booking_type: "member",
        created_by: MEMBER_ID,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const res = await cancelBooking("in-progress-1", MEMBER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/already started/i);
    });

    it("returns an error for an unknown booking id", async () => {
      const res = await cancelBooking("nope", MEMBER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });
  });

  // ===========================================================================
  // completeExpiredBookings (Fix 6)
  // ===========================================================================
  describe("completeExpiredBookings", () => {
    it("flips confirmed bookings with past end times to completed", async () => {
      MOCK_BOOKINGS.push({
        id: "expired-1",
        table_id: "table-7",
        member_id: MEMBER_ID,
        starts_at: hoursFromNow(-4),
        ends_at: hoursFromNow(-2),
        status: "confirmed",
        credits_used: 1,
        booking_type: "member",
        created_by: MEMBER_ID,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      const count = await completeExpiredBookings();
      expect(count).toBeGreaterThanOrEqual(1);
      const row = MOCK_BOOKINGS.find((b) => b.id === "expired-1")!;
      expect(row.status).toBe("completed");
    });

    it("leaves in-progress bookings alone (end still in the future)", async () => {
      MOCK_BOOKINGS.push({
        id: "in-progress-2",
        table_id: "table-7",
        member_id: MEMBER_ID,
        starts_at: hoursFromNow(-0.5),
        ends_at: hoursFromNow(0.5),
        status: "confirmed",
        credits_used: 1,
        booking_type: "member",
        created_by: MEMBER_ID,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await completeExpiredBookings();
      const row = MOCK_BOOKINGS.find((b) => b.id === "in-progress-2")!;
      expect(row.status).toBe("confirmed");
    });

    it("leaves terminal-state bookings alone", async () => {
      const cancelled = MOCK_BOOKINGS.find((b) => b.status === "cancelled")!;
      await completeExpiredBookings();
      expect(cancelled.status).toBe("cancelled");
    });
  });

  // ===========================================================================
  // createWalkIn
  // ===========================================================================
  describe("createWalkIn", () => {
    const staffId = "mock-staff-1";

    it("creates a walk-in booking and a linked guest row", async () => {
      const res = await createWalkIn({
        table_id: "table-7",
        starts_at: hoursFromNow(2),
        ends_at: hoursFromNow(3),
        guest_name: "Walk-in Group",
        guest_phone: "+6591234567",
        guest_count: 4,
        comments: "paid cash",
        deposit_required: true,
        deposit_paid: true,
        created_by: staffId,
      });
      expect(res.success).toBe(true);
      expect(res.booking_id).toBeDefined();
      const booking = MOCK_BOOKINGS.find((b) => b.id === res.booking_id);
      expect(booking?.booking_type).toBe("walk_in");
      expect(booking?.credits_used).toBe(0);
      expect(booking?.member_id).toBeNull();
      expect(
        MOCK_WALK_IN_GUESTS.find((g) => g.booking_id === res.booking_id)
      ).toBeDefined();
    });

    it("rejects a walk-in missing the guest name", async () => {
      const res = await createWalkIn({
        table_id: "table-7",
        starts_at: hoursFromNow(2),
        ends_at: hoursFromNow(3),
        guest_name: "  ",
        guest_count: 2,
        deposit_required: false,
        deposit_paid: false,
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/guest name/i);
    });

    it("rejects guest_count < 1", async () => {
      const res = await createWalkIn({
        table_id: "table-7",
        starts_at: hoursFromNow(2),
        ends_at: hoursFromNow(3),
        guest_name: "Nobody",
        guest_count: 0,
        deposit_required: false,
        deposit_paid: false,
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/guest count/i);
    });

    it("rejects deposit_paid=true when deposit_required=false", async () => {
      const res = await createWalkIn({
        table_id: "table-7",
        starts_at: hoursFromNow(2),
        ends_at: hoursFromNow(3),
        guest_name: "Someone",
        guest_count: 2,
        deposit_required: false,
        deposit_paid: true,
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/deposit/i);
    });

    it("rejects sessions longer than the 3h max", async () => {
      const res = await createWalkIn({
        table_id: "table-7",
        starts_at: hoursFromNow(2),
        ends_at: hoursFromNow(6),
        guest_name: "Someone",
        guest_count: 2,
        deposit_required: false,
        deposit_paid: false,
        created_by: staffId,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/3 hours/i);
    });

    it("rejects a walk-in that overlaps a confirmed booking", async () => {
      const existing = MOCK_BOOKINGS.find((b) => b.status === "confirmed")!;
      const res = await createWalkIn({
        table_id: existing.table_id,
        starts_at: existing.starts_at,
        ends_at: existing.ends_at,
        guest_name: "Someone",
        guest_count: 2,
        deposit_required: false,
        deposit_paid: false,
        created_by: staffId,
      });
      expect(res.success).toBe(false);
    });
  });
});
