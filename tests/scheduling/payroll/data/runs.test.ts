import { beforeEach, describe, expect, it } from "vitest";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import {
  createRun,
  deleteRun,
  getRun,
  listRuns,
  setRunStatus,
  setRunExported,
  setRunLastComputedAt,
} from "@/scheduling/payroll/data/runs";

beforeEach(() => {
  __resetMockPayroll();
});

describe("payroll runs (mock mode)", () => {
  it("creates a run with default draft status", async () => {
    const r = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    expect(r.success).toBe(true);
    expect(r.run?.status).toBe("draft");
  });

  it("rejects overlapping period creation", async () => {
    await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    const r2 = await createRun({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paymentDate: "2026-06-07",
    });
    expect(r2.success).toBe(false);
  });

  it("rejects when period_end < period_start", async () => {
    const r = await createRun({
      periodStart: "2026-05-31",
      periodEnd: "2026-05-01",
      paymentDate: "2026-06-07",
    });
    expect(r.success).toBe(false);
  });

  it("listRuns returns desc by period_start", async () => {
    await createRun({ periodStart: "2026-04-01", periodEnd: "2026-04-30", paymentDate: "2026-05-07" });
    await createRun({ periodStart: "2026-05-01", periodEnd: "2026-05-31", paymentDate: "2026-06-07" });
    const list = await listRuns();
    expect(list[0].period_start).toBe("2026-05-01");
    expect(list[1].period_start).toBe("2026-04-01");
  });

  it("setRunStatus transitions draft → review", async () => {
    const r = await createRun({ periodStart: "2026-05-01", periodEnd: "2026-05-31", paymentDate: "2026-06-07" });
    const out = await setRunStatus(r.run!.id, "review");
    expect(out.success).toBe(true);
    expect(out.run?.status).toBe("review");
  });

  it("setRunLastComputedAt stamps timestamp", async () => {
    const r = await createRun({ periodStart: "2026-05-01", periodEnd: "2026-05-31", paymentDate: "2026-06-07" });
    expect(r.run?.last_computed_at).toBeNull();
    await setRunLastComputedAt(r.run!.id);
    const fresh = await getRun(r.run!.id);
    expect(fresh?.last_computed_at).not.toBeNull();
  });

  it("setRunExported records format and timestamp", async () => {
    const r = await createRun({ periodStart: "2026-05-01", periodEnd: "2026-05-31", paymentDate: "2026-06-07" });
    await setRunExported(r.run!.id, "csv");
    const fresh = await getRun(r.run!.id);
    expect(fresh?.last_export_format).toBe("csv");
    expect(fresh?.last_exported_at).not.toBeNull();
  });

  it("deleteRun removes the row", async () => {
    const r = await createRun({ periodStart: "2026-05-01", periodEnd: "2026-05-31", paymentDate: "2026-06-07" });
    const out = await deleteRun(r.run!.id);
    expect(out.success).toBe(true);
    const fresh = await getRun(r.run!.id);
    expect(fresh).toBeNull();
  });
});
