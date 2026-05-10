import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportRunCsvAction,
  exportRunJsonAction,
  exportRunPdfAction,
  getStaffPayslipAction,
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
    expect(r.pdfBase64).toBeDefined();
    expect(r.contentType).toBe("application/pdf");
    expect(r.filename).toContain("Sam_Staff");
    // Base64 of a PDF starts with "JVBERi0" (the encoding of "%PDF-").
    expect(r.pdfBase64!.startsWith("JVBERi0")).toBe(true);
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
    expect(r.pdfBase64!.startsWith("UEsD")).toBe(true);
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
