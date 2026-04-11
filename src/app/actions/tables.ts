"use server";

import {
  getCurrentAuthUserId,
  getMemberProfile,
} from "@/lib/data/members";
import {
  getTableAvailabilityForDate,
  getTablesWithStatus,
  type TableDateAvailability,
  type TableWithStatus,
} from "@/lib/data/tables";

/**
 * Fetches the current floorplan state. Used by client-side polling/realtime
 * hooks to keep the floor view fresh without a full page reload. Any
 * authenticated user (member or staff) is allowed — unauthenticated callers
 * get an empty list so this can't be used to probe floorplan state anonymously.
 */
export async function getTablesWithStatusAction(): Promise<{
  tables: TableWithStatus[];
  error?: string;
}> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { tables: [], error: "Not signed in" };
  }
  const tables = await getTablesWithStatus();
  return { tables };
}

/**
 * Fetches per-table availability for a specific YYYY-MM-DD date. The member
 * booking flow calls this whenever the selected date changes so the floorplan
 * shows which tables are bookable on that day (rather than "right now").
 * Authenticated members only.
 */
export async function getTableAvailabilityForDateAction(
  date: string
): Promise<{ tables: TableDateAvailability[]; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { tables: [], error: "Not signed in" };
  }
  const member = await getMemberProfile(authUserId);
  // A signed-in caller who isn't a member (staff-only account) still gets the
  // availability summary, just without the "your booking" hints.
  const memberId = member?.id ?? null;

  try {
    const tables = await getTableAvailabilityForDate(date, memberId);
    return { tables };
  } catch (err) {
    return {
      tables: [],
      error:
        err instanceof Error ? err.message : "Failed to load availability",
    };
  }
}
