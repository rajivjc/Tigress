import { beforeEach, describe, expect, it } from "vitest";
import {
  endStaffRateAction,
  removeHolidayAction,
  removeRateRuleAction,
  setOvertimeRulesAction,
  setPayrollSettingsAction,
  setStaffRateAction,
  upsertHolidayAction,
  upsertRateRuleAction,
} from "@/scheduling/payroll/actions/configuration";
import {
  __resetMockPayroll,
  MOCK_PAYROLL_HOLIDAYS,
  MOCK_PAYROLL_OVERTIME_RULES,
  MOCK_PAYROLL_RATE_RULES,
  MOCK_PAYROLL_RATES,
  MOCK_PAYROLL_SETTINGS,
} from "@/scheduling/payroll/data/mock-data";
import { listRatesForStaff } from "@/scheduling/payroll/data/rates";
import { MOCK_SESSION_COOKIE } from "@/lib/auth/mock-users";
import { __setMockCookie } from "../../../stubs/next-headers";
import { resetMockData } from "../../../helpers/reset-mock-data";

function signInAs(authUserId: string | null) {
  __setMockCookie(MOCK_SESSION_COOKIE, authUserId);
}

beforeEach(() => {
  resetMockData();
  __resetMockPayroll();
  signInAs(null);
});

describe("setPayrollSettingsAction owner-only", () => {
  it("rejects manager", async () => {
    signInAs("mock-manager-1");
    const r = await setPayrollSettingsAction({ paymentOffsetDays: 14 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can update settings", async () => {
    signInAs("mock-owner-1");
    const r = await setPayrollSettingsAction({ paymentOffsetDays: 14 });
    expect(r.success).toBe(true);
    expect(MOCK_PAYROLL_SETTINGS[0].payment_offset_days).toBe(14);
  });
});

describe("setStaffRateAction owner-only + history closing", () => {
  it("rejects manager", async () => {
    signInAs("mock-manager-1");
    const r = await setStaffRateAction({
      staffId: "mock-staff-row-1",
      hourlyRate: 18,
      effectiveFrom: "2026-04-01",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can set a new rate; closes the prior open row", async () => {
    signInAs("mock-owner-1");
    const before = await listRatesForStaff("mock-staff-row-1");
    const openBefore = before.find((r) => r.effective_until === null);
    expect(openBefore).toBeDefined();

    const r = await setStaffRateAction({
      staffId: "mock-staff-row-1",
      hourlyRate: 20,
      effectiveFrom: "2026-04-01",
    });
    expect(r.success).toBe(true);

    const after = await listRatesForStaff("mock-staff-row-1");
    const newRow = after.find(
      (row) => row.hourly_rate === 20 && row.effective_until === null
    );
    expect(newRow).toBeDefined();
    const closedPrior = after.find(
      (row) => row.id === openBefore!.id && row.effective_until === "2026-04-01"
    );
    expect(closedPrior).toBeDefined();
  });
});

describe("endStaffRateAction owner-only", () => {
  it("rejects manager", async () => {
    signInAs("mock-manager-1");
    const r = await endStaffRateAction({
      staffId: "mock-staff-row-1",
      effectiveUntil: "2026-04-01",
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can end a rate", async () => {
    signInAs("mock-owner-1");
    const r = await endStaffRateAction({
      staffId: "mock-staff-row-1",
      effectiveUntil: "2026-04-01",
    });
    expect(r.success).toBe(true);
    const after = MOCK_PAYROLL_RATES.find(
      (row) =>
        row.staff_id === "mock-staff-row-1" &&
        row.effective_until === "2026-04-01"
    );
    expect(after).toBeDefined();
  });
});

describe("upsertRateRuleAction / removeRateRuleAction owner-only", () => {
  it("rejects manager from upsert", async () => {
    signInAs("mock-manager-1");
    const r = await upsertRateRuleAction({
      kind: "role",
      match_value: "bartender",
      multiplier: 1.25,
      priority: 100,
      is_active: true,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can upsert and remove a rate rule", async () => {
    signInAs("mock-owner-1");
    const u = await upsertRateRuleAction({
      kind: "role",
      match_value: "bartender",
      multiplier: 1.25,
      priority: 100,
      is_active: true,
    });
    expect(u.success).toBe(true);
    expect(MOCK_PAYROLL_RATE_RULES.length).toBe(1);
    const ruleId = MOCK_PAYROLL_RATE_RULES[0].id;

    const r = await removeRateRuleAction(ruleId);
    expect(r.success).toBe(true);
    expect(MOCK_PAYROLL_RATE_RULES.length).toBe(0);
  });

  it("rejects manager from remove", async () => {
    signInAs("mock-owner-1");
    await upsertRateRuleAction({
      kind: "role",
      match_value: "bartender",
      multiplier: 1.25,
      priority: 100,
      is_active: true,
    });
    const ruleId = MOCK_PAYROLL_RATE_RULES[0].id;
    signInAs("mock-manager-1");
    const r = await removeRateRuleAction(ruleId);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });
});

describe("setOvertimeRulesAction owner-only", () => {
  it("rejects manager", async () => {
    signInAs("mock-manager-1");
    const r = await setOvertimeRulesAction({ weeklyOtMultiplier: 2.0 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can update overtime rules", async () => {
    signInAs("mock-owner-1");
    const r = await setOvertimeRulesAction({ weeklyOtMultiplier: 2.0 });
    expect(r.success).toBe(true);
    expect(MOCK_PAYROLL_OVERTIME_RULES[0].weekly_ot_multiplier).toBe(2.0);
  });
});

describe("upsertHolidayAction / removeHolidayAction owner-only", () => {
  it("rejects manager from upsert", async () => {
    signInAs("mock-manager-1");
    const r = await upsertHolidayAction({
      date: "2026-12-31",
      name: "NYE",
      isActive: true,
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });

  it("owner can upsert and remove a holiday", async () => {
    signInAs("mock-owner-1");
    const u = await upsertHolidayAction({
      date: "2026-12-31",
      name: "NYE",
      isActive: true,
    });
    expect(u.success).toBe(true);
    expect(MOCK_PAYROLL_HOLIDAYS.find((h) => h.date === "2026-12-31")).toBeDefined();

    const r = await removeHolidayAction("2026-12-31");
    expect(r.success).toBe(true);
    expect(MOCK_PAYROLL_HOLIDAYS.find((h) => h.date === "2026-12-31")).toBeUndefined();
  });

  it("rejects manager from remove", async () => {
    signInAs("mock-manager-1");
    const r = await removeHolidayAction("2026-01-01");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/owner role required/i);
  });
});
