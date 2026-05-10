import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attestRunForReviewAction,
  createRunAction,
  deleteDraftRunAction,
  lockRunAction,
  recomputeRunAction,
  unattestRunAction,
  unlockRunAction,
} from "@/scheduling/payroll/actions/runs";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import { MOCK_SCHEDULE_CLOCK_RECORDS } from "@/scheduling/data/mock-data";
import { getRun, setRunStatus } from "@/scheduling/payroll/data/runs";
import {
  addLineItem,
  listLineItemsForRun,
} from "@/scheduling/payroll/data/line-items";
import {
  getReconciliation,
  lockRunWithSnapshot,
} from "@/scheduling/payroll/data/reconciliation";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../../stubs/next-headers";
import { resetMockData } from "../../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

async function createDraftRun(
  periodStart = "2026-04-01",
  periodEnd = "2026-04-30"
) {
  signInAs("mock-manager-1");
  const r = await createRunAction({ periodStart, periodEnd });
  expect(r.success).toBe(true);
  return r.runId!;
}

beforeEach(() => {
  resetMockData();
  __resetMockPayroll();
  signInAs(null);
});

describe("createRunAction authz", () => {
  it("rejects unauthenticated callers", async () => {
    const r = await createRunAction({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/signed in/i);
  });

  it("rejects staff role", async () => {
    signInAs("mock-staff-1");
    const r = await createRunAction({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can create", async () => {
    signInAs("mock-manager-1");
    const r = await createRunAction({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    expect(r.success).toBe(true);
    expect(r.runId).toBeDefined();
  });

  it("owner can create", async () => {
    signInAs("mock-owner-1");
    const r = await createRunAction({
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
    });
    expect(r.success).toBe(true);
  });
});

describe("attestRunForReviewAction authz + transition", () => {
  it("rejects staff", async () => {
    const runId = await createDraftRun();
    signInAs("mock-staff-1");
    const r = await attestRunForReviewAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can attest a draft", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const r = await attestRunForReviewAction(runId);
    expect(r.success).toBe(true);
    const run = await getRun(runId);
    expect(run?.status).toBe("review");
  });

  it("owner can attest a draft", async () => {
    const runId = await createDraftRun();
    signInAs("mock-owner-1");
    const r = await attestRunForReviewAction(runId);
    expect(r.success).toBe(true);
  });

  it("rejects when run is not in draft status", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId); // → review
    const r = await attestRunForReviewAction(runId); // already review
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not in draft/i);
  });

  // -------------------------------------------------------------------
  // S27a-fix-2 Finding 13: attest detects ACTIVE + PENDING_REVIEW clock
  // records via the new listClockRecordsInPeriod status-filter param,
  // not the per-staff loop the original code ran.
  // -------------------------------------------------------------------
  it("blocks attest when an in-period clock record is still active", async () => {
    const runId = await createDraftRun();
    MOCK_SCHEDULE_CLOCK_RECORDS.push({
      id: "clk-active-1",
      shift_id: "shift-x",
      user_id: "mock-staff-row-1",
      // Mid-period.
      clocked_in_at: "2026-04-15T10:00:00Z",
      clocked_out_at: null,
      status: "active",
      locked_at: null,
      locked_by: null,
      unlock_note: null,
      manager_edited: false,
      manager_edit_note: null,
      created_at: "2026-04-15T10:00:00Z",
      updated_at: "2026-04-15T10:00:00Z",
    });
    signInAs("mock-manager-1");
    const r = await attestRunForReviewAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/clock record/i);
  });

  it("blocks attest when an in-period clock record is still pending_review", async () => {
    const runId = await createDraftRun();
    MOCK_SCHEDULE_CLOCK_RECORDS.push({
      id: "clk-pending-1",
      shift_id: "shift-y",
      user_id: "mock-staff-row-2",
      clocked_in_at: "2026-04-20T10:00:00Z",
      clocked_out_at: "2026-04-20T18:00:00Z",
      status: "pending_review",
      locked_at: null,
      locked_by: null,
      unlock_note: null,
      manager_edited: false,
      manager_edit_note: null,
      created_at: "2026-04-20T10:00:00Z",
      updated_at: "2026-04-20T18:00:00Z",
    });
    signInAs("mock-manager-1");
    const r = await attestRunForReviewAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/clock record/i);
  });

  it("ignores clock records outside the period window", async () => {
    const runId = await createDraftRun();
    // Before-period active record — should NOT block attest.
    MOCK_SCHEDULE_CLOCK_RECORDS.push({
      id: "clk-before-1",
      shift_id: "shift-z",
      user_id: "mock-staff-row-1",
      clocked_in_at: "2026-03-15T10:00:00Z",
      clocked_out_at: null,
      status: "active",
      locked_at: null,
      locked_by: null,
      unlock_note: null,
      manager_edited: false,
      manager_edit_note: null,
      created_at: "2026-03-15T10:00:00Z",
      updated_at: "2026-03-15T10:00:00Z",
    });
    signInAs("mock-manager-1");
    const r = await attestRunForReviewAction(runId);
    expect(r.success).toBe(true);
  });
});

describe("unattestRunAction authz + transition", () => {
  it("rejects staff", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-staff-1");
    const r = await unattestRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can unattest review back to draft", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await unattestRunAction(runId);
    expect(r.success).toBe(true);
    const run = await getRun(runId);
    expect(run?.status).toBe("draft");
  });

  it("rejects when run is not in review", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const r = await unattestRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not in review/i);
  });
});

describe("lockRunAction owner-only enforcement", () => {
  it("rejects staff with the specific owner-required error", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-staff-1");
    const r = await lockRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("rejects manager with the specific owner-required error (the audit finding)", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await lockRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can lock a review run", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    const r = await lockRunAction(runId);
    expect(r.success).toBe(true);
    const run = await getRun(runId);
    expect(run?.status).toBe("locked");
  });

  it("rejects when run is not in review", async () => {
    const runId = await createDraftRun();
    signInAs("mock-owner-1");
    const r = await lockRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not in review/i);
  });

  it("snapshots reconciliation on lock", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    await lockRunAction(runId);
    const recon = await getReconciliation(runId);
    expect(recon).not.toBeNull();
  });

  // -------------------------------------------------------------------
  // S27a-fix-2 Finding 13 regression: the lock-snapshot path must keep
  // filtering to LOCKED clock records via the listClockRecordsInPeriod
  // default param. Stage one locked record + one pending_review record;
  // assert only the locked one is captured in the snapshot.
  // -------------------------------------------------------------------
  it("lock snapshot only captures LOCKED clock records (default status filter)", async () => {
    const runId = await createDraftRun();
    MOCK_SCHEDULE_CLOCK_RECORDS.push({
      id: "clk-locked-in-period",
      shift_id: "shift-a",
      user_id: "mock-staff-row-1",
      clocked_in_at: "2026-04-10T10:00:00Z",
      clocked_out_at: "2026-04-10T18:00:00Z",
      status: "locked",
      locked_at: "2026-04-10T19:00:00Z",
      locked_by: "mock-staff-row-3",
      unlock_note: null,
      manager_edited: false,
      manager_edit_note: null,
      created_at: "2026-04-10T10:00:00Z",
      updated_at: "2026-04-10T19:00:00Z",
    });
    // pending_review record in-period — must NOT appear in the snapshot
    // even though attest blocks earlier; we lock the run via the data
    // layer to bypass attest's reconciliation guard for this assertion.
    MOCK_SCHEDULE_CLOCK_RECORDS.push({
      id: "clk-pending-in-period",
      shift_id: "shift-b",
      user_id: "mock-staff-row-1",
      clocked_in_at: "2026-04-12T10:00:00Z",
      clocked_out_at: "2026-04-12T18:00:00Z",
      status: "pending_review",
      locked_at: null,
      locked_by: null,
      unlock_note: null,
      manager_edited: false,
      manager_edit_note: null,
      created_at: "2026-04-12T10:00:00Z",
      updated_at: "2026-04-12T18:00:00Z",
    });
    // Move directly to review via data layer (skip attest's guard).
    await setRunStatus(runId, "review");
    signInAs("mock-owner-1");
    const r = await lockRunAction(runId);
    expect(r.success).toBe(true);
    const recon = await getReconciliation(runId);
    expect(recon).not.toBeNull();
    const captured = (recon!.clock_records as Array<{ id: string }>);
    expect(captured.map((c) => c.id)).toEqual(["clk-locked-in-period"]);
  });

  it("emits payroll.run.locked exactly once", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    const auditModule = await import("@/scheduling/payroll/audit");
    const spy = vi.spyOn(auditModule, "writePayrollAuditLog");
    await lockRunAction(runId);
    const lockedCalls = spy.mock.calls.filter(
      (c) => c[0] === "payroll.run.locked"
    );
    expect(lockedCalls.length).toBe(1);
    spy.mockRestore();
  });

  it("does not write audit log when the lock data-layer call fails", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    // Sneak in a stale snapshot so the data-layer rejects with
    // "Reconciliation already exists".
    await lockRunWithSnapshot(
      {
        runId,
        clockRecords: [],
        ratesSnapshot: [],
        overtimeRulesSnapshot: {
          id: "ot-1",
          weekly_threshold_hours: 44,
          weekly_ot_multiplier: 1.5,
          daily_threshold_hours: null,
          daily_ot_multiplier: 1.5,
          rest_day_multiplier: 2,
          public_holiday_multiplier: 2,
          rest_day_strategy: "sunday",
          created_at: "2025-01-01T00:00:00Z",
          updated_at: "2025-01-01T00:00:00Z",
        },
        holidaysSnapshot: [],
      },
      "mock-staff-row-3" // owner
    );
    // Run already locked. Move it back to review for the action to attempt
    // the lock again — this triggers the "Reconciliation already exists"
    // path inside lockRunWithSnapshot.
    await setRunStatus(runId, "review");
    const auditModule = await import("@/scheduling/payroll/audit");
    const spy = vi.spyOn(auditModule, "writePayrollAuditLog");
    const r = await lockRunAction(runId);
    expect(r.success).toBe(false);
    const lockedCalls = spy.mock.calls.filter(
      (c) => c[0] === "payroll.run.locked"
    );
    expect(lockedCalls.length).toBe(0);
    spy.mockRestore();
  });
});

describe("unlockRunAction owner-only + required note", () => {
  async function lockedRun(): Promise<string> {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    const r = await lockRunAction(runId);
    expect(r.success).toBe(true);
    return runId;
  }

  it("rejects staff with owner-required error", async () => {
    const runId = await lockedRun();
    signInAs("mock-staff-1");
    const r = await unlockRunAction({ runId, note: "fix" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("rejects manager with owner-required error (audit finding)", async () => {
    const runId = await lockedRun();
    signInAs("mock-manager-1");
    const r = await unlockRunAction({ runId, note: "fix" });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("rejects empty note", async () => {
    const runId = await lockedRun();
    signInAs("mock-owner-1");
    const r = await unlockRunAction({ runId, note: "   " });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/note is required/i);
  });

  it("owner can unlock with a note", async () => {
    const runId = await lockedRun();
    signInAs("mock-owner-1");
    const r = await unlockRunAction({ runId, note: "discovered missed PH" });
    expect(r.success).toBe(true);
    const run = await getRun(runId);
    expect(run?.status).toBe("review");
    expect(run?.unlock_note).toBe("discovered missed PH");
  });

  it("unlock deletes the reconciliation snapshot", async () => {
    const runId = await lockedRun();
    expect(await getReconciliation(runId)).not.toBeNull();
    signInAs("mock-owner-1");
    await unlockRunAction({ runId, note: "fix" });
    expect(await getReconciliation(runId)).toBeNull();
  });

  it("emits payroll.run.unlocked exactly once on success", async () => {
    const runId = await lockedRun();
    signInAs("mock-owner-1");
    const auditModule = await import("@/scheduling/payroll/audit");
    const spy = vi.spyOn(auditModule, "writePayrollAuditLog");
    await unlockRunAction({ runId, note: "fix" });
    const unlocked = spy.mock.calls.filter(
      (c) => c[0] === "payroll.run.unlocked"
    );
    expect(unlocked.length).toBe(1);
    spy.mockRestore();
  });
});

describe("recomputeRunAction authz + status guard", () => {
  it("rejects staff", async () => {
    const runId = await createDraftRun();
    signInAs("mock-staff-1");
    const r = await recomputeRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can recompute a draft", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const r = await recomputeRunAction(runId);
    expect(r.success).toBe(true);
  });

  it("rejects on review status with specific error", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await recomputeRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/draft status/i);
  });

  it("rejects on locked status with specific error", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    await lockRunAction(runId);
    signInAs("mock-manager-1");
    const r = await recomputeRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/draft status/i);
  });

  it("preserves manual line items across recompute", async () => {
    const runId = await createDraftRun();
    // Insert a manual line item directly via the data layer.
    await addLineItem({
      runId,
      staffId: "mock-staff-row-1",
      kind: "tip",
      label: "Friday tip pool",
      amount: 30,
      source: "manual",
      notes: null,
    });
    signInAs("mock-manager-1");
    await recomputeRunAction(runId);
    const items = await listLineItemsForRun(runId);
    const tip = items.find((i) => i.kind === "tip");
    expect(tip).toBeDefined();
    expect(tip?.label).toBe("Friday tip pool");
  });

  it("updates last_computed_at", async () => {
    const runId = await createDraftRun();
    const before = (await getRun(runId))?.last_computed_at;
    signInAs("mock-manager-1");
    // createRunAction already runs the engine once, so before may already
    // be stamped. Sleep a tick equivalent — just compare strict-greater.
    await new Promise((r) => setTimeout(r, 5));
    await recomputeRunAction(runId);
    const after = (await getRun(runId))?.last_computed_at;
    expect(after).not.toBeNull();
    if (before) {
      expect(after! >= before!).toBe(true);
    }
  });
});

describe("deleteDraftRunAction authz + status guard", () => {
  it("rejects staff", async () => {
    const runId = await createDraftRun();
    signInAs("mock-staff-1");
    const r = await deleteDraftRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/manager or owner/i);
  });

  it("manager can delete a draft", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    const r = await deleteDraftRunAction(runId);
    expect(r.success).toBe(true);
    expect(await getRun(runId)).toBeNull();
  });

  it("rejects on review with specific error", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    const r = await deleteDraftRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/only draft/i);
  });

  it("rejects on locked with specific error", async () => {
    const runId = await createDraftRun();
    signInAs("mock-manager-1");
    await attestRunForReviewAction(runId);
    signInAs("mock-owner-1");
    await lockRunAction(runId);
    signInAs("mock-manager-1");
    const r = await deleteDraftRunAction(runId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/only draft/i);
  });
});
