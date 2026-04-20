import { describe, it, expect, beforeEach } from "vitest";
import {
  getBookingsNeedingReminder,
  markReminderSent,
} from "@/lib/data/bookings";
import { MOCK_BOOKINGS } from "@/lib/data/mock-data";
import type { Booking } from "@/lib/types";
import { resetMockData } from "../helpers/reset-mock-data";
import { GET as cronHandler } from "@/app/api/cron/booking-reminders/route";

const MEMBER_ID = "mock-member-row-1";

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function pushBooking(overrides: Partial<Booking>): string {
  const id = overrides.id ?? `reminder-test-${MOCK_BOOKINGS.length + 1}`;
  const now = new Date().toISOString();
  MOCK_BOOKINGS.push({
    id,
    table_id: "table-3",
    member_id: MEMBER_ID,
    starts_at: minutesFromNow(60),
    ends_at: minutesFromNow(120),
    status: "confirmed",
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

function reminderWindow(): { start: string; end: string } {
  const now = Date.now();
  return {
    start: new Date(now + 45 * 60 * 1000).toISOString(),
    end: new Date(now + 75 * 60 * 1000).toISOString(),
  };
}

describe("booking reminders data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  describe("getBookingsNeedingReminder", () => {
    it("includes a booking starting 60 minutes from now (inside 45–75 window)", async () => {
      const id = pushBooking({
        id: "window-hit",
        starts_at: minutesFromNow(60),
        ends_at: minutesFromNow(120),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).toContain(id);
    });

    it("excludes a booking starting 30 minutes from now (before window)", async () => {
      const id = pushBooking({
        id: "window-miss-early",
        starts_at: minutesFromNow(30),
        ends_at: minutesFromNow(90),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).not.toContain(id);
    });

    it("excludes a booking starting 120 minutes from now (after window)", async () => {
      const id = pushBooking({
        id: "window-miss-late",
        starts_at: minutesFromNow(120),
        ends_at: minutesFromNow(180),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).not.toContain(id);
    });

    it("excludes a booking that has already been reminded", async () => {
      const id = pushBooking({
        id: "already-reminded",
        starts_at: minutesFromNow(60),
        ends_at: minutesFromNow(120),
        reminder_sent_at: new Date().toISOString(),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).not.toContain(id);
    });

    it("excludes cancelled bookings", async () => {
      const id = pushBooking({
        id: "cancelled-in-window",
        status: "cancelled",
        starts_at: minutesFromNow(60),
        ends_at: minutesFromNow(120),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).not.toContain(id);
    });

    it("excludes completed bookings", async () => {
      const id = pushBooking({
        id: "completed-in-window",
        status: "completed",
        starts_at: minutesFromNow(60),
        ends_at: minutesFromNow(120),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).not.toContain(id);
    });

    it("excludes walk-in bookings", async () => {
      const id = pushBooking({
        id: "walkin-in-window",
        booking_type: "walk_in",
        member_id: null,
        starts_at: minutesFromNow(60),
        ends_at: minutesFromNow(120),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).not.toContain(id);
    });

    it("excludes admin_block bookings", async () => {
      const id = pushBooking({
        id: "block-in-window",
        booking_type: "admin_block",
        member_id: null,
        starts_at: minutesFromNow(60),
        ends_at: minutesFromNow(120),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows.map((r) => r.booking_id)).not.toContain(id);
    });

    it("resolves member_name and table_number for enriched row", async () => {
      const id = pushBooking({
        id: "enriched",
        starts_at: minutesFromNow(60),
        ends_at: minutesFromNow(120),
      });
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      const row = rows.find((r) => r.booking_id === id);
      expect(row).toBeDefined();
      expect(row?.member_id).toBe(MEMBER_ID);
      expect(row?.member_name).toMatch(/\w+/);
      expect(typeof row?.table_number).toBe("number");
    });

    it("returns an empty array when no bookings match", async () => {
      // resetMockData() leaves seeded bookings, but none land in the
      // immediate 45–75min window from "now".
      const { start, end } = reminderWindow();
      const rows = await getBookingsNeedingReminder(start, end);
      expect(rows).toEqual([]);
    });
  });

  describe("markReminderSent", () => {
    it("sets reminder_sent_at on the booking row", async () => {
      const id = pushBooking({
        id: "to-mark",
        reminder_sent_at: null,
      });
      const res = await markReminderSent(id);
      expect(res.success).toBe(true);
      const row = MOCK_BOOKINGS.find((b) => b.id === id)!;
      expect(row.reminder_sent_at).not.toBeNull();
      expect(Date.parse(row.reminder_sent_at!)).toBeGreaterThan(0);
    });

    it("is a no-op for an unknown booking id (still returns success)", async () => {
      const res = await markReminderSent("does-not-exist");
      expect(res.success).toBe(true);
    });
  });
});

describe("cron route auth guard (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
    process.env.CRON_SECRET = "test-secret";
  });

  function buildRequest(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/cron/booking-reminders", {
      method: "GET",
      headers,
    });
  }

  it("returns 401 when the Authorization header is missing", async () => {
    const res = await cronHandler(buildRequest({}));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the secret is wrong", async () => {
    const res = await cronHandler(
      buildRequest({ authorization: "Bearer wrong-secret" })
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 with { sent: 0 } when the secret is correct (mock mode)", async () => {
    const res = await cronHandler(
      buildRequest({ authorization: "Bearer test-secret" })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number };
    expect(body.sent).toBe(0);
  });
});
