// =============================================================================
// Scheduling — audit helper (Session 25)
// =============================================================================
// Wraps the existing `audit_log` table so every scheduling event is prefixed
// `schedule.`. Mock mode is a no-op.
// =============================================================================

import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScheduleAuditEventType } from "./types";

export async function writeScheduleAuditLog(
  action: ScheduleAuditEventType,
  entityId: string | null,
  actorId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: actorId,
      action,
      entity_type: "schedule",
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best effort */
  }
}
