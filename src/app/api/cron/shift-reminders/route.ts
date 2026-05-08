// =============================================================================
// GET /api/cron/shift-reminders
// =============================================================================
// Hourly cron that delivers a 1h-before-shift reminder push to every staff
// member assigned to a published shift whose start falls in the next 45–75
// minute window. Idempotent via schedule_shift_notifications_sent — a
// flapping cron cannot fire twice for the same (shift, kind) pair.
//
// Auth + mock-mode behaviour mirrors the booking-reminders route.
// =============================================================================

import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { listShiftsStartingInWindow } from "@/scheduling/data/weeks";
import { claimShiftNotification } from "@/scheduling/data/notifications";
import { sendPushToStaff } from "@/lib/push/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_START_MIN = 45;
const WINDOW_END_MIN = 75;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ sent: 0, mock: true });
  }

  const now = Date.now();
  const windowStart = new Date(now + WINDOW_START_MIN * 60 * 1000).toISOString();
  const windowEnd = new Date(now + WINDOW_END_MIN * 60 * 1000).toISOString();

  const shifts = await listShiftsStartingInWindow(windowStart, windowEnd);

  let sent = 0;
  await Promise.all(
    shifts.map(async (shift) => {
      if (!shift.user_id) return;
      const claimed = await claimShiftNotification(shift.id, "one_hour_warning");
      if (!claimed) return;
      try {
        await sendPushToStaff(shift.user_id, {
          title: "Shift starting soon",
          body: `Your ${shift.role} shift starts at ${shift.start_time.slice(0, 5)}`,
          url: "/staff/clock",
          tag: `shift-1h-${shift.id}`,
        });
        sent += 1;
      } catch (err) {
        console.warn("[cron/shift-reminders] failed", shift.id, err);
      }
    })
  );

  return NextResponse.json({ sent });
}
