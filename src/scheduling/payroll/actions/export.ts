"use server";

import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { writePayrollAuditLog } from "../audit";
import { listLineItemsForRun } from "../data/line-items";
import { getRun, setRunExported } from "../data/runs";
import { formatRunAsCsv } from "../lib/csv";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

export async function exportRunCsvAction(
  runId: string
): Promise<{ success: boolean; csv?: string; filename?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const run = await getRun(runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status === "draft") {
    return { success: false, error: "Run must be reviewed or locked to export" };
  }

  const [items, staff] = await Promise.all([
    listLineItemsForRun(runId),
    listAllStaff(),
  ]);

  const csv = formatRunAsCsv({
    run,
    lineItems: items,
    staff: staff.map((s) => ({ id: s.id, full_name: s.full_name })),
  });
  const filename = `payroll-${run.period_start}-to-${run.period_end}.csv`;

  await setRunExported(runId, "csv");
  await writePayrollAuditLog(
    "payroll.run.exported",
    runId,
    current.staff.id,
    { format: "csv" }
  );
  return { success: true, csv, filename };
}
