import { beforeEach, describe, expect, it } from "vitest";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import {
  getReconciliation,
  lockRunWithSnapshot,
  unlockRun,
} from "@/scheduling/payroll/data/reconciliation";
import { createRun, getRun, setRunStatus } from "@/scheduling/payroll/data/runs";
import type {
  PayrollHoliday,
  PayrollOvertimeRules,
} from "@/scheduling/payroll/types";

const FIXED_TS = "2025-01-01T00:00:00.000Z";
const OT_RULES: PayrollOvertimeRules = {
  id: "ot-1",
  weekly_threshold_hours: 44,
  weekly_ot_multiplier: 1.5,
  daily_threshold_hours: null,
  daily_ot_multiplier: 1.5,
  rest_day_multiplier: 2,
  public_holiday_multiplier: 2,
  rest_day_strategy: "sunday",
  created_at: FIXED_TS,
  updated_at: FIXED_TS,
};

const HOLIDAYS: PayrollHoliday[] = [];

beforeEach(() => {
  __resetMockPayroll();
});

describe("payroll reconciliation (mock mode)", () => {
  it("lockRunWithSnapshot transitions review → locked and writes snapshot", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    await setRunStatus(run.run!.id, "review");
    const r = await lockRunWithSnapshot(
      {
        runId: run.run!.id,
        clockRecords: [],
        ratesSnapshot: [],
        overtimeRulesSnapshot: OT_RULES,
        holidaysSnapshot: HOLIDAYS,
      },
      "owner-1"
    );
    expect(r.success).toBe(true);
    const fresh = await getRun(run.run!.id);
    expect(fresh?.status).toBe("locked");
    expect(fresh?.locked_by).toBe("owner-1");
    const recon = await getReconciliation(run.run!.id);
    expect(recon).not.toBeNull();
  });

  it("lockRunWithSnapshot rejects when run is not in review", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    // Still in draft.
    const r = await lockRunWithSnapshot(
      {
        runId: run.run!.id,
        clockRecords: [],
        ratesSnapshot: [],
        overtimeRulesSnapshot: OT_RULES,
        holidaysSnapshot: HOLIDAYS,
      },
      "owner-1"
    );
    expect(r.success).toBe(false);
  });

  it("unlockRun deletes snapshot and transitions locked → review", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    await setRunStatus(run.run!.id, "review");
    await lockRunWithSnapshot(
      {
        runId: run.run!.id,
        clockRecords: [],
        ratesSnapshot: [],
        overtimeRulesSnapshot: OT_RULES,
        holidaysSnapshot: HOLIDAYS,
      },
      "owner-1"
    );
    const out = await unlockRun(run.run!.id, "owner-1", "Mistake in OT calc");
    expect(out.success).toBe(true);
    const fresh = await getRun(run.run!.id);
    expect(fresh?.status).toBe("review");
    expect(fresh?.unlock_note).toBe("Mistake in OT calc");
    const recon = await getReconciliation(run.run!.id);
    expect(recon).toBeNull();
  });

  it("unlockRun requires a non-empty note", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    await setRunStatus(run.run!.id, "review");
    await lockRunWithSnapshot(
      {
        runId: run.run!.id,
        clockRecords: [],
        ratesSnapshot: [],
        overtimeRulesSnapshot: OT_RULES,
        holidaysSnapshot: HOLIDAYS,
      },
      "owner-1"
    );
    const r = await unlockRun(run.run!.id, "owner-1", "");
    expect(r.success).toBe(false);
  });

  it("unlockRun rejects when run is not locked", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    const r = await unlockRun(run.run!.id, "owner-1", "note");
    expect(r.success).toBe(false);
  });
});
