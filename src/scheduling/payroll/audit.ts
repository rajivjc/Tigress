// =============================================================================
// Payroll — audit helper (Session 27a)
// =============================================================================
// Wraps the existing `audit_log` table so every payroll event is prefixed
// `payroll.`. Distinct prefix from `schedule.*` because the audience and
// retention needs differ. Mock mode is a no-op.
// =============================================================================

import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PayrollAuditEventType } from "./types";

export async function writePayrollAuditLog(
  action: PayrollAuditEventType,
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
      entity_type: "payroll",
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best effort */
  }
}
