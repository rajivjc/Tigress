import { beforeEach, describe, expect, it } from "vitest";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import {
  addLineItem,
  listLineItemsForRun,
  recomputeEngineItems,
  updateLineItem,
  deleteLineItem,
} from "@/scheduling/payroll/data/line-items";
import { createRun } from "@/scheduling/payroll/data/runs";

beforeEach(() => {
  __resetMockPayroll();
});

describe("payroll line items (mock mode)", () => {
  it("addLineItem persists and returns the row", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    const r = await addLineItem({
      runId: run.run!.id,
      staffId: "u1",
      kind: "allowance",
      label: "Transport",
      amount: 50,
      source: "manual",
    });
    expect(r.success).toBe(true);
    expect(r.item?.amount).toBe(50);
  });

  it("recompute deletes engine items and preserves manual items", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    // Add one manual + one engine.
    await addLineItem({
      runId: run.run!.id,
      staffId: "u1",
      kind: "allowance",
      label: "Manual",
      amount: 50,
      source: "manual",
    });
    await addLineItem({
      runId: run.run!.id,
      staffId: "u1",
      kind: "hours",
      label: "Engine",
      amount: 100,
      source: "engine",
    });
    const before = await listLineItemsForRun(run.run!.id);
    expect(before).toHaveLength(2);

    // Recompute with new engine drafts (one new engine row).
    await recomputeEngineItems(run.run!.id, [
      {
        run_id: run.run!.id,
        staff_id: "u1",
        kind: "hours",
        label: "Recomputed",
        amount: 200,
        hours: 10,
        rate_applied: 20,
        multipliers: null,
        source: "engine",
        clock_record_id: null,
        notes: null,
      },
    ]);

    const after = await listLineItemsForRun(run.run!.id);
    expect(after).toHaveLength(2);
    const manual = after.find((i) => i.source === "manual");
    const engine = after.find((i) => i.source === "engine");
    expect(manual?.label).toBe("Manual");
    expect(engine?.label).toBe("Recomputed");
    expect(engine?.amount).toBe(200);
  });

  it("recompute fails when run is not in draft", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    // Manually flip status.
    const { setRunStatus } = await import("@/scheduling/payroll/data/runs");
    await setRunStatus(run.run!.id, "review");
    const r = await recomputeEngineItems(run.run!.id, []);
    expect(r.success).toBe(false);
  });

  it("updateLineItem updates label/amount", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    const added = await addLineItem({
      runId: run.run!.id,
      staffId: "u1",
      kind: "allowance",
      label: "X",
      amount: 10,
      source: "manual",
    });
    const upd = await updateLineItem({
      id: added.item!.id,
      label: "Y",
      amount: 20,
    });
    expect(upd.success).toBe(true);
    expect(upd.item?.label).toBe("Y");
    expect(upd.item?.amount).toBe(20);
  });

  it("deleteLineItem removes the row", async () => {
    const run = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    const added = await addLineItem({
      runId: run.run!.id,
      staffId: "u1",
      kind: "allowance",
      label: "X",
      amount: 10,
      source: "manual",
    });
    await deleteLineItem(added.item!.id);
    const after = await listLineItemsForRun(run.run!.id);
    expect(after).toEqual([]);
  });
});
