import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOCK_PAYROLL_RECONCILIATION,
  MOCK_PAYROLL_RUNS,
  __resetMockPayroll,
} from "@/scheduling/payroll/data/mock-data";
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

  // -------------------------------------------------------------------
  // S27a-fix Finding 4: locked_by stays put across unlock; unlocked_by
  // captures the most-recent unlock event.
  // -------------------------------------------------------------------

  it("unlockRun preserves locked_by/locked_at and stamps unlocked_by/unlocked_at", async () => {
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
      "owner-original"
    );
    const lockedSnapshot = await getRun(run.run!.id);
    expect(lockedSnapshot?.locked_by).toBe("owner-original");
    expect(lockedSnapshot?.unlocked_by).toBeNull();

    const out = await unlockRun(
      run.run!.id,
      "owner-different",
      "fixing rate row"
    );
    expect(out.success).toBe(true);
    const fresh = await getRun(run.run!.id);
    expect(fresh?.status).toBe("review");
    // locked_by/at remain visible — they describe the prior lock event.
    expect(fresh?.locked_by).toBe("owner-original");
    expect(fresh?.locked_at).not.toBeNull();
    // unlock fields capture the new actor + timestamp.
    expect(fresh?.unlocked_by).toBe("owner-different");
    expect(fresh?.unlocked_at).not.toBeNull();
    expect(fresh?.unlock_note).toBe("fixing rate row");
  });

  // -------------------------------------------------------------------
  // S27a-fix-2 Finding 11: rollback restores the PRIOR cycle's
  // locked_by/locked_at, not nulls.
  // -------------------------------------------------------------------

  it("failed re-lock rollback restores the prior cycle's locked_by/locked_at, not nulls", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    await setRunStatus(run.run!.id, "review");
    // 1st lock — establishes prior locked_by/locked_at.
    await lockRunWithSnapshot(
      {
        runId: run.run!.id,
        clockRecords: [],
        ratesSnapshot: [],
        overtimeRulesSnapshot: OT_RULES,
        holidaysSnapshot: HOLIDAYS,
      },
      "owner-original"
    );
    await unlockRun(run.run!.id, "owner-original", "needed correction");
    const beforeRetry = await getRun(run.run!.id);
    expect(beforeRetry?.locked_by).toBe("owner-original");
    expect(beforeRetry?.locked_at).not.toBeNull();

    // Inject a throw on the reconciliation push so the re-lock fails.
    const pushSpy = vi
      .spyOn(MOCK_PAYROLL_RECONCILIATION, "push")
      .mockImplementationOnce(() => {
        throw new Error("simulated DB failure");
      });
    try {
      const r = await lockRunWithSnapshot(
        {
          runId: run.run!.id,
          clockRecords: [],
          ratesSnapshot: [],
          overtimeRulesSnapshot: OT_RULES,
          holidaysSnapshot: HOLIDAYS,
        },
        "owner-second"
      );
      expect(r.success).toBe(false);
    } finally {
      pushSpy.mockRestore();
    }

    // The prior cycle's metadata should be intact, NOT wiped to nulls.
    const after = await getRun(run.run!.id);
    expect(after?.status).toBe("review");
    expect(after?.locked_by).toBe("owner-original");
    expect(after?.locked_at).toBe(beforeRetry!.locked_at);
    expect(after?.unlock_note).toBe("needed correction");
  });

  it("re-lock cycle (lock → unlock → re-lock) leaves locked_by set to the second locker and unlocked_by from the original unlock", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    await setRunStatus(run.run!.id, "review");

    // 1st lock
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

    // Unlock
    await unlockRun(run.run!.id, "owner-1", "needed correction");

    // 2nd lock (different owner)
    await lockRunWithSnapshot(
      {
        runId: run.run!.id,
        clockRecords: [],
        ratesSnapshot: [],
        overtimeRulesSnapshot: OT_RULES,
        holidaysSnapshot: HOLIDAYS,
      },
      "owner-2"
    );

    const fresh = await getRun(run.run!.id);
    expect(fresh?.status).toBe("locked");
    expect(fresh?.locked_by).toBe("owner-2"); // current lock
    expect(fresh?.unlocked_by).toBe("owner-1"); // prior unlock event
    expect(fresh?.unlock_note).toBeNull(); // cleared on re-lock
  });

  // -------------------------------------------------------------------
  // S27a-fix-2 Finding 16 / S27b-fix Finding 17: mock-mode unlockRun
  // snapshot + rollback parity with lockRunWithSnapshot.
  //
  // Two distinct failure shapes:
  //
  //   1. Splice itself throws — recon row never leaves the array, no
  //      run-row mutation has happened yet. We expect the call to
  //      surface the error; rollback is mostly a no-op. (Original
  //      Finding 16 test, retained but renamed.)
  //
  //   2. Splice succeeds, but a subsequent run-row write fails. This is
  //      the path that genuinely engages the rollback: the recon row is
  //      already gone AND the run-row is mid-mutation. The rollback
  //      MUST (a) re-insert the recon row and (b) restore the run-row
  //      to its prior locked state.
  //
  // Pattern for case 2 is Proxy-on-mutation-target — wrap the run row
  // returned by `find` so an assignment to `unlocked_at` throws AFTER
  // the splice has already executed (S27b-fix Finding 17 — see
  // CLAUDE.md "Writing throw-injection atomicity tests").
  // -------------------------------------------------------------------
  it("reports failure when reconciliation splice itself fails (recon row stays put, no rollback needed)", async () => {
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
      "owner-original"
    );
    const beforeUnlock = await getRun(run.run!.id);
    expect(beforeUnlock?.status).toBe("locked");
    const reconBefore = await getReconciliation(run.run!.id);
    expect(reconBefore).not.toBeNull();

    // Inject a throw on the splice path. The splice never executes, so
    // the recon row stays in the array. We're verifying the call
    // surfaces the failure; the rollback path is reached but is a
    // no-op (nothing to undo).
    const spliceSpy = vi
      .spyOn(MOCK_PAYROLL_RECONCILIATION, "splice")
      .mockImplementationOnce(() => {
        throw new Error("simulated DB failure");
      });
    try {
      const r = await unlockRun(run.run!.id, "owner-2", "trying again");
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/simulated DB failure/);
    } finally {
      spliceSpy.mockRestore();
    }

    // Recon row survives intact (splice never executed).
    const reconAfter = await getReconciliation(run.run!.id);
    expect(reconAfter).not.toBeNull();
    // Run is unchanged from its locked state.
    const after = await getRun(run.run!.id);
    expect(after?.status).toBe("locked");
  });

  it("rolls back BOTH the splice AND the run mutation when run-row write fails (Proxy mutation-target injection)", async () => {
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
      "owner-original"
    );
    const beforeUnlock = await getRun(run.run!.id);
    expect(beforeUnlock?.status).toBe("locked");
    const reconBefore = await getReconciliation(run.run!.id);
    expect(reconBefore).not.toBeNull();

    // Wrap the run row in a Proxy that throws on assignment to
    // `unlocked_at`. By the time that assignment runs, the splice has
    // already removed the recon row AND the run.status flip to "review"
    // has executed — the rollback MUST restore both. If the rollback
    // were silently broken, the recon row would stay deleted or the
    // run would be stuck in a half-unlocked state.
    const findSpy = vi.spyOn(MOCK_PAYROLL_RUNS, "find");
    let proxyApplied = false;
    let firstWriteFailed = false;
    findSpy.mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      const result = Array.prototype.find.apply(
        MOCK_PAYROLL_RUNS,
        args as Parameters<typeof Array.prototype.find>
      );
      if (!result) return result;
      if (proxyApplied) return result;
      proxyApplied = true;
      return new Proxy(result, {
        set(target, key, value) {
          if (key === "unlocked_at" && !firstWriteFailed) {
            // Throw only on the first attempt — any subsequent
            // assignment is part of the rollback path and must be
            // allowed through so the snapshot restore actually lands.
            firstWriteFailed = true;
            throw new Error("simulated DB failure on run mutation");
          }
          return Reflect.set(target, key, value);
        },
      });
    });

    try {
      const r = await unlockRun(run.run!.id, "owner-2", "trying again");
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/simulated DB failure/);
    } finally {
      findSpy.mockRestore();
    }

    // Run is back to its locked state — rollback restored the status
    // flip from "review" back to "locked" and any partial unlock
    // metadata writes.
    const after = await getRun(run.run!.id);
    expect(after?.status).toBe("locked");
    expect(after?.unlock_note).toBe(beforeUnlock!.unlock_note);
    expect(after?.unlocked_by).toBe(beforeUnlock!.unlocked_by);
    expect(after?.unlocked_at).toBe(beforeUnlock!.unlocked_at);
    // Reconciliation row was deleted by the splice but restored by the
    // rollback's idempotent re-insert.
    const reconAfter = await getReconciliation(run.run!.id);
    expect(reconAfter).not.toBeNull();
  });
});
