// =============================================================================
// Scheduling — shift notification dedup (Session 26)
// =============================================================================
// One row per (shift_id, kind) pair the cron has already sent. Tries to
// claim the row before sending so a flapping cron can't double-fire.
// =============================================================================

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_SCHEDULE_SHIFT_NOTIFICATIONS_SENT } from "./mock-data";
import type { ShiftNotificationKind } from "../types";

const nowIso = () => new Date().toISOString();

/**
 * Records that a notification of the given kind has been sent for the
 * shift. Returns true if this is the first time (and the caller should
 * actually send the push), false if a previous run already claimed it.
 */
export async function claimShiftNotification(
  shiftId: string,
  kind: ShiftNotificationKind
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const exists = MOCK_SCHEDULE_SHIFT_NOTIFICATIONS_SENT.some(
      (n) => n.shift_id === shiftId && n.kind === kind
    );
    if (exists) return false;
    MOCK_SCHEDULE_SHIFT_NOTIFICATIONS_SENT.push({
      shift_id: shiftId,
      kind,
      sent_at: nowIso(),
    });
    return true;
  }
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("schedule_shift_notifications_sent")
    .insert({ shift_id: shiftId, kind });
  if (error) {
    // Unique violation = someone else got there first. Anything else is a
    // genuine failure but we still don't want to send when the dedup row
    // can't be persisted.
    return false;
  }
  return true;
}
