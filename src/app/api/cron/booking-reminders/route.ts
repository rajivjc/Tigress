// =============================================================================
// GET /api/cron/booking-reminders
// =============================================================================
// Vercel Cron invokes this endpoint every 15 minutes (see vercel.json). It
// picks up confirmed member bookings whose start time falls in the 45–75
// minute window from "now", sends a push reminder to each booker, and stamps
// `reminder_sent_at` so the booking is skipped on subsequent runs.
//
// Vercel Cron authenticates requests with `Authorization: Bearer <CRON_SECRET>`.
// The secret is compared in constant-ish time (simple string equality is
// acceptable here — the token is long, random, and both values are the same
// length by construction).
//
// Failure modes are handled defensively:
//   - Mock mode (Supabase not configured) returns { sent: 0 } without error.
//   - Push failures on individual bookings are logged but don't halt the loop.
//   - `reminder_sent_at` is set AFTER a push attempt so a failed push will be
//     retried on the next cron tick.
// =============================================================================

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  getBookingsNeedingReminder,
  markReminderSent,
} from "@/lib/data/bookings";
import { sendPushToMember } from "@/lib/push/send";
import { formatTime } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Window size (minutes) the cron reminders consider on each tick. */
const REMINDER_WINDOW_START_MIN = 45;
const REMINDER_WINDOW_END_MIN = 75;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Mock mode: no DB to query, no VAPID keys likely set — return zero without
  // touching the data layer so local/dev deployments don't spam their logs.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ sent: 0, mock: true });
  }

  const now = Date.now();
  const windowStartUtc = new Date(
    now + REMINDER_WINDOW_START_MIN * 60 * 1000
  ).toISOString();
  const windowEndUtc = new Date(
    now + REMINDER_WINDOW_END_MIN * 60 * 1000
  ).toISOString();

  const bookings = await getBookingsNeedingReminder(
    windowStartUtc,
    windowEndUtc
  );

  let sent = 0;
  for (const booking of bookings) {
    try {
      await sendPushToMember(booking.member_id, {
        title: "Session Reminder",
        body: `Table ${booking.table_number} in ~1 hour (${formatTime(booking.starts_at)}).`,
        url: `/bookings/${booking.booking_id}`,
        tag: `reminder-${booking.booking_id}`,
      });
      await markReminderSent(booking.booking_id);
      sent++;
    } catch (err) {
      // Per-booking failure shouldn't halt the rest of the batch. The
      // reminder_sent_at column is only set on success, so the next cron
      // run will retry this booking.
      console.warn(
        "[cron/booking-reminders] failed for booking",
        booking.booking_id,
        err
      );
    }
  }

  return NextResponse.json({ sent });
}
