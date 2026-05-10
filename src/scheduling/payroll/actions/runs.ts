"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { sendPushToStaffMembers } from "@/lib/push/send";
import { writePayrollAuditLog } from "../audit";
import { listClockRecordsInPeriod } from "../../data/clock-records";
import {
  createRun,
  deleteRun as deleteRunRow,
  getRun,
  setRunStatus,
} from "../data/runs";
import {
  listLineItemsForRun,
} from "../data/line-items";
import {
  getReconciliation,
  lockRunWithSnapshot,
  unlockRun as unlockRunRow,
} from "../data/reconciliation";
import { recomputeEngineItems } from "../data/line-items";
import { computeEngineItems } from "../lib/engine";
import { getSettings } from "../data/settings";
import { getOvertimeRules } from "../data/overtime-rules";
import { listHolidaysInRange } from "../data/holidays";
import { listAllRates } from "../data/rates";

function isManager(role: string): boolean {
  return role === "manager" || role === "owner";
}

function isOwner(role: string): boolean {
  return role === "owner";
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

// =============================================================================
// Create + delete
// =============================================================================

export async function createRunAction(input: {
  periodStart: string;
  periodEnd: string;
}): Promise<{ success: boolean; runId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const settings = await getSettings();
  const offset = settings?.payment_offset_days ?? 7;
  const paymentDate = addDays(input.periodEnd, offset);

  const created = await createRun({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    paymentDate,
  });
  if (!created.success || !created.run) {
    return { success: false, error: created.error };
  }

  // Run engine immediately so the user sees something.
  const { drafts } = await computeEngineItems({
    runId: created.run.id,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  await recomputeEngineItems(created.run.id, drafts);

  await writePayrollAuditLog(
    "payroll.run.created",
    created.run.id,
    current.staff.id,
    {
      period_start: input.periodStart,
      period_end: input.periodEnd,
      payment_date: paymentDate,
    }
  );
  revalidatePath("/manager/payroll");
  return { success: true, runId: created.run.id };
}

export async function recomputeRunAction(
  runId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const run = await getRun(runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "draft") {
    return { success: false, error: "Recompute requires draft status" };
  }

  const { drafts } = await computeEngineItems({
    runId,
    periodStart: run.period_start,
    periodEnd: run.period_end,
  });
  const result = await recomputeEngineItems(runId, drafts);
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.run.recomputed",
    runId,
    current.staff.id,
    { inserted: result.inserted ?? drafts.length }
  );
  revalidatePath(`/manager/payroll/runs/${runId}`);
  return { success: true };
}

export async function attestRunForReviewAction(
  runId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const run = await getRun(runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "draft") {
    return { success: false, error: "Run is not in draft" };
  }

  // Reconciliation: no clock records in period in active or pending_review.
  // Single batched query via the status-filter param (S27a-fix-2 Finding 13)
  // — replaces the per-staff loop the original implementation ran.
  const periodStartIso = `${run.period_start}T00:00:00Z`;
  const periodEndExclusiveIso = `${addDays(run.period_end, 1)}T00:00:00Z`;
  const dirtyRecords = await listClockRecordsInPeriod(
    periodStartIso,
    periodEndExclusiveIso,
    ["active", "pending_review"]
  );
  if (dirtyRecords.length > 0) {
    return {
      success: false,
      error: `Cannot attest: ${dirtyRecords.length} clock record(s) still need review/lock`,
    };
  }

  const result = await setRunStatus(runId, "review");
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.run.attested",
    runId,
    current.staff.id,
    {}
  );
  revalidatePath(`/manager/payroll/runs/${runId}`);
  return { success: true };
}

export async function unattestRunAction(
  runId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const run = await getRun(runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "review") {
    return { success: false, error: "Run is not in review" };
  }

  const result = await setRunStatus(runId, "draft");
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.run.unattested",
    runId,
    current.staff.id,
    {}
  );
  revalidatePath(`/manager/payroll/runs/${runId}`);
  return { success: true };
}

export async function lockRunAction(
  runId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }

  const run = await getRun(runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "review") {
    return { success: false, error: "Run is not in review" };
  }

  // Build snapshot inputs.
  const periodStartIso = `${run.period_start}T00:00:00Z`;
  const periodEndExclusiveIso = `${addDays(run.period_end, 1)}T00:00:00Z`;
  const [allRates, otRules, holidays, clockRecords] = await Promise.all([
    listAllRates(),
    getOvertimeRules(),
    listHolidaysInRange(run.period_start, run.period_end),
    listClockRecordsInPeriod(periodStartIso, periodEndExclusiveIso),
  ]);
  if (!otRules) {
    return { success: false, error: "Overtime rules not configured" };
  }

  const result = await lockRunWithSnapshot(
    {
      runId,
      clockRecords,
      ratesSnapshot: allRates,
      overtimeRulesSnapshot: otRules,
      holidaysSnapshot: holidays,
    },
    current.staff.id
  );
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.run.locked",
    runId,
    current.staff.id,
    {
      period_start: run.period_start,
      period_end: run.period_end,
    }
  );

  // Notify every staff with a line item in this run.
  const items = await listLineItemsForRun(runId);
  const staffIds = Array.from(new Set(items.map((i) => i.staff_id)));
  await sendPushToStaffMembers(staffIds, {
    title: "Payslip finalised",
    body: `Your payslip for ${run.period_start} – ${run.period_end} is finalised.`,
    url: "/staff/payroll",
    tag: `payroll-locked-${runId}`,
  });

  revalidatePath(`/manager/payroll/runs/${runId}`);
  revalidatePath("/manager/payroll");
  return { success: true };
}

export async function unlockRunAction(input: {
  runId: string;
  note: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  if (!input.note.trim()) {
    return { success: false, error: "Unlock note is required" };
  }

  const run = await getRun(input.runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "locked") {
    return { success: false, error: "Run is not locked" };
  }

  const result = await unlockRunRow(input.runId, current.staff.id, input.note);
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.run.unlocked",
    input.runId,
    current.staff.id,
    { note: input.note }
  );

  // Notify previously-notified staff.
  const items = await listLineItemsForRun(input.runId);
  const staffIds = Array.from(new Set(items.map((i) => i.staff_id)));
  await sendPushToStaffMembers(staffIds, {
    title: "Payslip being revised",
    body: `Your payslip for ${run.period_start} – ${run.period_end} is being revised.`,
    url: "/staff/payroll",
    tag: `payroll-unlocked-${input.runId}`,
  });

  revalidatePath(`/manager/payroll/runs/${input.runId}`);
  revalidatePath("/manager/payroll");
  return { success: true };
}

export async function deleteDraftRunAction(
  runId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManager(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const run = await getRun(runId);
  if (!run) return { success: false, error: "Run not found" };
  if (run.status !== "draft") {
    return { success: false, error: "Only draft runs can be deleted" };
  }
  const result = await deleteRunRow(runId);
  if (!result.success) return { success: false, error: result.error };

  await writePayrollAuditLog(
    "payroll.run.deleted",
    runId,
    current.staff.id,
    { period_start: run.period_start, period_end: run.period_end }
  );
  revalidatePath("/manager/payroll");
  return { success: true };
}

// Re-export useful query helpers for the UI without exposing the data layer.
export async function getRunReconciliation(runId: string) {
  const current = await getCurrentStaff();
  if (!current || !isManager(current.role)) return null;
  return getReconciliation(runId);
}
