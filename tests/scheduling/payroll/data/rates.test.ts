import { beforeEach, describe, expect, it } from "vitest";
import { __resetMockPayroll } from "@/scheduling/payroll/data/mock-data";
import {
  endStaffRate,
  getRateOn,
  listRatesForStaff,
  setStaffRate,
} from "@/scheduling/payroll/data/rates";

beforeEach(() => {
  __resetMockPayroll();
});

describe("payroll rates (mock mode)", () => {
  it("seed includes base rates for mock staff", async () => {
    const rates = await listRatesForStaff("mock-staff-row-1");
    expect(rates.length).toBeGreaterThan(0);
  });

  it("setStaffRate closes prior open rate at effective_from", async () => {
    await setStaffRate({
      staffId: "mock-staff-row-1",
      hourlyRate: 18,
      effectiveFrom: "2026-06-01",
    });
    const all = await listRatesForStaff("mock-staff-row-1");
    const closed = all.find((r) => r.effective_until === "2026-06-01");
    const open = all.find((r) => r.effective_until === null);
    expect(closed).toBeDefined();
    expect(open?.hourly_rate).toBe(18);
  });

  it("getRateOn returns the active rate for a date", async () => {
    await setStaffRate({
      staffId: "mock-staff-row-1",
      hourlyRate: 18,
      effectiveFrom: "2026-06-01",
    });
    const before = await getRateOn("mock-staff-row-1", "2026-05-31");
    const after = await getRateOn("mock-staff-row-1", "2026-06-15");
    expect(before?.hourly_rate).toBe(16);
    expect(after?.hourly_rate).toBe(18);
  });

  it("endStaffRate closes the open rate", async () => {
    await endStaffRate("mock-staff-row-1", "2026-06-30");
    const fresh = await listRatesForStaff("mock-staff-row-1");
    expect(fresh.every((r) => r.effective_until !== null)).toBe(true);
  });

  it("rejects negative hourly rate", async () => {
    const r = await setStaffRate({
      staffId: "mock-staff-row-1",
      hourlyRate: -5,
      effectiveFrom: "2026-06-01",
    });
    expect(r.success).toBe(false);
  });
});
