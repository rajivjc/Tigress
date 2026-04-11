"use server";

import { getCurrentAuthUserId } from "@/lib/data/members";
import {
  getTablesWithStatus,
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
