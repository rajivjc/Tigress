import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportRunCsvAction,
  exportRunJsonAction,
  exportRunPdfAction,
  getStaffPayslipAction,
  getStaffPayslipsSummaryAction,
} from "@/scheduling/payroll/actions/export";
import {
  attestRunForReviewAction,
  createRunAction,
  lockRunAction,
} from "@/scheduling/payroll/actions/runs";
import { addLineItemAction } from "@/scheduling/payroll/actions/line-items";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import { addLineItem } from "@/scheduling/payroll/data/line-items";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../../stubs/next-headers";
import { resetMockData } from "../../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

async function createDraftRun(): Promise<string> {
  signInAs("mock-manager-1");
  const r = await createRunAction({
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
  });
  expect(r.success).toBe(true);
  return r.runId!;
}

beforeEach(() => {
  resetMockData();
  __resetMockPayroll();
  signInAs(null);
});

describe("exportRunCsvAction", () => {
  it("rejects staff", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-staff-1");
    const r = await exportRunCsvAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can export a review run", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await exportRunCsvAction(runId);
    expect(r.success).toBe(true);
    expect(r.csv).toBeDefined();
    expect(r.filename).toContain("payroll-2026-04-01-to-2026-04-30");
  });

  it("owner can export", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    const r = await exportRunCsvAction(runId);
    expect(r.success).toBe(true);
  });

  it("rejects on draft with the specific error", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const r = await exportRunCsvAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/reviewed or locked/i);
  });

  it("emits payroll.run.exported with format=csv", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const auditModule = await import("@/scheduling/payroll/audit");
    const spy = vi.spyOn(auditModule, "writePayrollAuditLog");
    await exportRunCsvAction(runId);
    const exported = spy.mock.calls.filter(
      (c) => c[0] === "payroll.run.exported"
    );
    expect(exported.length).toBe(1);
    expect((exported[0][3] as Record<string, unknown>).format).toBe("csv");
    spy.mockRestore();
  });

  it("CSV format snapshot — header + a representative line item row", async () => {
    const runId = await createDraftRun();
    // Seed a deterministic manual line item; engine items are time-of-run
    // dependent (no clock records seeded → none) so the CSV rows are stable.
    signInAs("mock-manager-1");
    await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "Tip pool",
      amount: 30,
    });
    await addLineItemAction({
      runId,
      staffId: "mock-staff-row-1",
      kind: "deduction",
      label: "Uniform",
      amount: -5,
    });
    // Also seed an engine "hours" item so the regular columns aren't
    // entirely empty.
    await addLineItem({
      runId,
      staffId: "mock-staff-row-1",
      kind: "hours",
      label: "Regular hours",
      amount: 320,
      hours: 40,
      rateApplied: 8,
      source: "engine",
      notes: null,
    });
    await attestRunForReviewAction(runId);
    const r = await exportRunCsvAction(runId);
    expect(r.success).toBe(true);
    const lines = (r.csv ?? "").split("\n");
    expect(lines[0]).toBe(
      [
        "staff_id",
        "staff_name",
        "period_start",
        "period_end",
        "regular_hours",
        "regular_amount",
        "daily_ot_hours",
        "daily_ot_amount",
        "weekly_ot_hours",
        "weekly_ot_amount",
        "rest_day_hours",
        "rest_day_amount",
        "public_holiday_hours",
        "public_holiday_amount",
        "allowances_total",
        "tips_total",
        "bonuses_total",
        "deductions_total",
        "statutory_total",
        "other_total",
        "gross",
        "net",
      ].join(",")
    );
    // Find the row for mock-staff-row-1 (Sam Staff).
    const samRow = lines.find((l) => l.startsWith("mock-staff-row-1,"));
    expect(samRow).toBeDefined();
    // Exact-string match against the expected representation.
    // 40h × $8 = $320 regular, +30 tips, -5 deduction → gross 350, net 345.
    expect(samRow).toBe(
      "mock-staff-row-1,Sam Staff,2026-04-01,2026-04-30,40.00,320.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,30.00,0.00,-5.00,0.00,0.00,350.00,345.00"
    );
  });
});

// =============================================================================
// JSON export (S27b)
// =============================================================================

async function lockedRunWithItems(): Promise<string> {
  const runId = await createDraftRun();
  signInAs("mock-manager-1");
  await addLineItem({
    runId,
    staffId: "mock-staff-row-1",
    kind: "hours",
    label: "Regular hours",
    amount: 320,
    hours: 40,
    rateApplied: 8,
    source: "engine",
    notes: null,
  });
  await addLineItem({
    runId,
    staffId: "mock-staff-row-2",
    kind: "hours",
    label: "Regular hours",
    amount: 880,
    hours: 40,
    rateApplied: 22,
    source: "engine",
    notes: null,
  });
  await attestRunForReviewAction(runId);
  signInAs("mock-owner-1");
  await lockRunAction(runId);
  return runId;
}

describe("exportRunJsonAction", () => {
  it("rejects staff", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-staff-1");
    const r = await exportRunJsonAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("rejects review-only runs (locked-only)", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await exportRunJsonAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/locked/i);
  });

  it("manager can export a locked run", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const r = await exportRunJsonAction(runId);
    expect(r.success).toBe(true);
    expect(r.json).toBeDefined();
    expect(r.filename).toContain("payroll-2026-04-01-to-2026-04-30");
    expect(r.filename).toContain(".json");
  });

  it("returns a PayslipDocument with format_version=1.0", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const r = await exportRunJsonAction(runId);
    expect(r.success).toBe(true);
    const doc = JSON.parse(r.json!);
    expect(doc.metadata.format_version).toBe("1.0");
    expect(doc.run.id).toBe(runId);
    expect(doc.staff.length).toBe(2);
    expect(doc.staff[0].totals.gross).toBe(320);
    expect(doc.venue.name).toBe("Tigress");
    expect(doc.run.currency).toBe("SGD");
  });

  it("emits payroll.run.exported with format=json", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const auditModule = await import("@/scheduling/payroll/audit");
    const spy = vi.spyOn(auditModule, "writePayrollAuditLog");
    await exportRunJsonAction(runId);
    const exported = spy.mock.calls.filter(
      (c) => c[0] === "payroll.run.exported"
    );
    expect(exported.length).toBe(1);
    expect((exported[0][3] as Record<string, unknown>).format).toBe("json");
    spy.mockRestore();
  });
});

// =============================================================================
// PDF export — single + batch (S27b)
// =============================================================================

describe("exportRunPdfAction", () => {
  it("rejects staff", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-staff-1");
    const r = await exportRunPdfAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("rejects review-only runs (locked-only)", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await exportRunPdfAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/locked/i);
  });

  it("manager can export a single-staff PDF (base64)", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const r = await exportRunPdfAction(runId, "mock-staff-row-1");
    expect(r.success).toBe(true);
    expect(r.data).toBeDefined();
    expect(r.contentType).toBe("application/pdf");
    expect(r.filename).toContain("Sam_Staff");
    // Base64 of a PDF starts with "JVBERi0" (the encoding of "%PDF-").
    expect(r.data!.startsWith("JVBERi0")).toBe(true);
  }, 20000);

  it("rejects single-staff PDF when the staff has no line items in the run", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const r = await exportRunPdfAction(runId, "mock-staff-row-3");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/no payslip line items/i);
  });

  it("manager can export a batch zip (no staffId)", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const r = await exportRunPdfAction(runId);
    expect(r.success).toBe(true);
    expect(r.contentType).toBe("application/zip");
    expect(r.filename).toContain("payslips.zip");
    // Base64 of a ZIP starts with "UEsD" (encoding of PK\x03\x04).
    expect(r.data!.startsWith("UEsD")).toBe(true);
  }, 30000);

  it("emits payroll.run.exported with format=pdf for single", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const auditModule = await import("@/scheduling/payroll/audit");
    const spy = vi.spyOn(auditModule, "writePayrollAuditLog");
    await exportRunPdfAction(runId, "mock-staff-row-1");
    const exported = spy.mock.calls.filter(
      (c) => c[0] === "payroll.run.exported"
    );
    expect(exported.length).toBe(1);
    expect((exported[0][3] as Record<string, unknown>).format).toBe("pdf");
    spy.mockRestore();
  }, 20000);

  it("emits payroll.run.exported with format=pdf_batch for batch", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const auditModule = await import("@/scheduling/payroll/audit");
    const spy = vi.spyOn(auditModule, "writePayrollAuditLog");
    await exportRunPdfAction(runId);
    const exported = spy.mock.calls.filter(
      (c) => c[0] === "payroll.run.exported"
    );
    expect(exported.length).toBe(1);
    expect((exported[0][3] as Record<string, unknown>).format).toBe("pdf_batch");
    spy.mockRestore();
  }, 30000);
});

// =============================================================================
// getStaffPayslipAction (S27b)
// =============================================================================

describe("getStaffPayslipAction", () => {
  it("rejects unauthenticated callers", async () => {
    const runId = await lockedRunWithItems();
    signInAs(null);
    const r = await getStaffPayslipAction({ runId });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not signed in/i);
  });

  it("rejects member callers (member auth doesn't resolve as staff)", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-member-1");
    const r = await getStaffPayslipAction({ runId });
    expect(r.success).toBe(false);
    // Members aren't staff, so getCurrentStaff returns null and the
    // action short-circuits at the auth gate.
    expect(r.error).toMatch(/not signed in/i);
  });

  it("staff can read their own payslip", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-staff-1");
    const r = await getStaffPayslipAction({ runId });
    expect(r.success).toBe(true);
    expect(r.doc?.staff).toHaveLength(1);
    expect(r.doc?.staff[0].staff_id).toBe("mock-staff-row-1");
    expect(r.doc?.staff[0].totals.gross).toBe(320);
  });

  it("staff cannot read another staff's payslip", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-staff-1");
    const r = await getStaffPayslipAction({
      runId,
      staffId: "mock-staff-row-2",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/cannot view another staff/i);
  });

  it("manager can read any staff's payslip", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const r = await getStaffPayslipAction({
      runId,
      staffId: "mock-staff-row-1",
    });
    expect(r.success).toBe(true);
    expect(r.doc?.staff[0].staff_id).toBe("mock-staff-row-1");
  });

  it("rejects when the run is not locked", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-staff-1");
    const r = await getStaffPayslipAction({ runId });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not yet finalised/i);
  });
});

// =============================================================================
// getStaffPayslipsSummaryAction (S27b-fix Finding 18)
// =============================================================================

describe("getStaffPayslipsSummaryAction", () => {
  it("returns empty array when there are no locked runs", async () => {
    signInAs("mock-staff-1");
    const r = await getStaffPayslipsSummaryAction();
    expect(r.success).toBe(true);
    expect(r.summaries).toEqual([]);
  });

  it("excludes runs with no line items for the staff", async () => {
    // Locked run that only has line items for staff-row-1 + staff-row-2.
    // mock-pt-1 (staff-row-4) has no items in this run.
    await lockedRunWithItems();
    signInAs("mock-pt-1");
    const r = await getStaffPayslipsSummaryAction();
    expect(r.success).toBe(true);
    expect(r.summaries).toEqual([]);
  });

  it("staff sees their own summary (gross + net match transformer)", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-staff-1");
    const summary = await getStaffPayslipsSummaryAction();
    expect(summary.success).toBe(true);
    expect(summary.summaries).toHaveLength(1);
    expect(summary.summaries![0].run.id).toBe(runId);
    expect(summary.summaries![0].hasItems).toBe(true);

    // Cross-check against the detail action (which also runs through the
    // transformer). Listing must match detail exactly.
    const detail = await getStaffPayslipAction({ runId });
    expect(detail.success).toBe(true);
    expect(summary.summaries![0].gross).toBe(
      detail.doc!.staff[0].totals.gross
    );
    expect(summary.summaries![0].net).toBe(detail.doc!.staff[0].totals.net);
    expect(summary.summaries![0].currency).toBe("SGD");
  });

  it("listing gross matches detail gross when a negative bonus clawback is present", async () => {
    // The old inline gross logic on the page used a positive-amount filter,
    // which would EXCLUDE a negative-amount `bonus` clawback from gross —
    // diverging from the transformer's kind-exclusion definition (only
    // deduction + statutory are excluded from gross). Confirm both match.
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await addLineItem({
      runId,
      staffId: "mock-staff-row-1",
      kind: "hours",
      label: "Regular hours",
      amount: 320,
      hours: 40,
      rateApplied: 8,
      source: "engine",
      notes: null,
    });
    await addLineItem({
      runId,
      staffId: "mock-staff-row-1",
      kind: "bonus",
      label: "Bonus clawback",
      amount: -50,
      source: "manual",
      notes: null,
    });
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    await lockRunAction(runId);

    signInAs("mock-staff-1");
    const summary = await getStaffPayslipsSummaryAction();
    expect(summary.success).toBe(true);
    expect(summary.summaries).toHaveLength(1);

    const detail = await getStaffPayslipAction({ runId });
    expect(detail.success).toBe(true);
    // Transformer's gross = 320 (hours) + (-50) (bonus) = 270.
    // Old listing (positive-amount filter) would have produced 320.
    expect(detail.doc!.staff[0].totals.gross).toBe(270);
    expect(summary.summaries![0].gross).toBe(detail.doc!.staff[0].totals.gross);
    expect(summary.summaries![0].net).toBe(detail.doc!.staff[0].totals.net);
  });

  it("staff cannot view another staff's summaries", async () => {
    await lockedRunWithItems();
    signInAs("mock-staff-1");
    const r = await getStaffPayslipsSummaryAction({
      staffId: "mock-staff-row-2",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/cannot view another staff/i);
  });

  it("manager can view any staff's summaries via staffId param", async () => {
    const runId = await lockedRunWithItems();
    signInAs("mock-manager-1");
    const r = await getStaffPayslipsSummaryAction({
      staffId: "mock-staff-row-2",
    });
    expect(r.success).toBe(true);
    expect(r.summaries).toHaveLength(1);
    expect(r.summaries![0].run.id).toBe(runId);
  });

  it("rejects unauthenticated callers", async () => {
    signInAs(null);
    const r = await getStaffPayslipsSummaryAction();
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not signed in/i);
  });

  // -------------------------------------------------------------------
  // N+1 regression guard. The action MUST batch via listLineItemsForRuns;
  // it must NOT call the per-run listLineItemsForRun in a loop. Future
  // maintainers can't accidentally regress without breaking this test.
  // -------------------------------------------------------------------
  it("uses one batched fetch — never calls the per-run listLineItemsForRun", async () => {
    // Lock multiple runs so a per-run loop would be visibly N>1.
    const runIdA = await createDraftRun();
    signInAs("mock-manager-1");
    await addLineItem({
      runId: runIdA,
      staffId: "mock-staff-row-1",
      kind: "hours",
      label: "Regular hours",
      amount: 100,
      hours: 10,
      rateApplied: 10,
      source: "engine",
      notes: null,
    });
    await attestRunForReviewAction(runIdA);
    signInAs("mock-owner-1");
    await lockRunAction(runIdA);

    signInAs("mock-manager-1");
    const r2 = await createRunAction({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
    });
    const runIdB = r2.runId!;
    await addLineItem({
      runId: runIdB,
      staffId: "mock-staff-row-1",
      kind: "hours",
      label: "Regular hours",
      amount: 200,
      hours: 20,
      rateApplied: 10,
      source: "engine",
      notes: null,
    });
    await attestRunForReviewAction(runIdB);
    signInAs("mock-owner-1");
    await lockRunAction(runIdB);

    const lineItemsModule = await import(
      "@/scheduling/payroll/data/line-items"
    );
    const perRunSpy = vi.spyOn(lineItemsModule, "listLineItemsForRun");
    const batchedSpy = vi.spyOn(lineItemsModule, "listLineItemsForRuns");

    signInAs("mock-staff-1");
    const r = await getStaffPayslipsSummaryAction();
    expect(r.success).toBe(true);
    expect(r.summaries).toHaveLength(2);

    // Per-run fetcher must NOT be called by the summary action.
    expect(perRunSpy).not.toHaveBeenCalled();
    // Batched fetcher must be called exactly once.
    expect(batchedSpy).toHaveBeenCalledTimes(1);

    perRunSpy.mockRestore();
    batchedSpy.mockRestore();
  });
});
