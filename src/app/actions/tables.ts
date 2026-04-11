"use server";

import {
  getTablesWithStatus,
  type TableWithStatus,
} from "@/lib/data/tables";

/**
 * Fetches the current floorplan state. Used by client-side polling/realtime
 * hooks to keep the floor view fresh without a full page reload.
 */
export async function getTablesWithStatusAction(): Promise<{
  tables: TableWithStatus[];
}> {
  const tables = await getTablesWithStatus();
  return { tables };
}
