// =============================================================================
// Competitions — audit helper (Session 21)
// =============================================================================
// Wraps the existing `audit_log` table so every module event is prefixed
// `comp.` and can be lifted out in one pass if the module is ever extracted.
// =============================================================================

import "server-only";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CompAuditEventType } from "./types";

/**
 * Best-effort audit-log write. Mirrors the pattern used by the rest of the
 * app (see `writePostAuditLog` in `src/app/actions/posts.ts`). Mock mode is
 * a no-op so tests don't need an audit stub; failures never block the
 * calling action.
 *
 * `entity_type` is always `"competition"` — the specific sub-entity (match,
 * entrant, team, guest, skill) is carried in `metadata.entityType` plus the
 * `action` verb, which keeps the single `audit_log` table from fragmenting.
 */
export async function writeCompAuditLog(
  action: CompAuditEventType,
  entityId: string,
  actorId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      actor_id: actorId,
      action,
      entity_type: "competition",
      entity_id: entityId,
      metadata,
    });
  } catch {
    /* best effort — audit failures must never break the user action */
  }
}
