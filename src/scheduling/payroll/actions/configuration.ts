"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { writePayrollAuditLog } from "../audit";
import { updateSettings } from "../data/settings";
import { endStaffRate, setStaffRate } from "../data/rates";
import {
  removeRateRule,
  upsertRateRule as upsertRateRuleRow,
  type UpsertRateRuleInput,
} from "../data/rate-rules";
import { updateOvertimeRules } from "../data/overtime-rules";
import { removeHoliday, upsertHoliday } from "../data/holidays";
import type {
  PayFrequency,
  PayrollExportFormat,
  RestDayStrategy,
} from "../types";

function isOwner(role: string): boolean {
  return role === "owner";
}

export async function setPayrollSettingsAction(input: {
  payFrequency?: PayFrequency;
  paymentOffsetDays?: number;
  defaultExportFormat?: PayrollExportFormat;
  statutoryDeductionPct?: number;
  currency?: string;
  timezone?: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  // Build the patch from defined fields only, mirroring the
  // updateBrandingAction pattern — Object.assign in the data layer
  // would clobber existing values when an unspecified field is undefined.
  const patch: Parameters<typeof updateSettings>[0] = {};
  if (input.payFrequency !== undefined) patch.pay_frequency = input.payFrequency;
  if (input.paymentOffsetDays !== undefined)
    patch.payment_offset_days = input.paymentOffsetDays;
  if (input.defaultExportFormat !== undefined)
    patch.default_export_format = input.defaultExportFormat;
  if (input.statutoryDeductionPct !== undefined)
    patch.statutory_deduction_pct = input.statutoryDeductionPct;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.timezone !== undefined) patch.timezone = input.timezone;

  const result = await updateSettings(patch);
  if (!result) return { success: false, error: "Update failed" };

  await writePayrollAuditLog(
    "payroll.settings.updated",
    result.id,
    current.staff.id,
    { ...input }
  );
  revalidatePath("/manager/payroll");
  return { success: true };
}

export async function setStaffRateAction(input: {
  staffId: string;
  hourlyRate: number;
  effectiveFrom: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  const result = await setStaffRate(input);
  if (!result.success) return { success: false, error: result.error };
  await writePayrollAuditLog(
    "payroll.rate.set",
    result.rate?.id ?? null,
    current.staff.id,
    {
      staff_id: input.staffId,
      hourly_rate: input.hourlyRate,
      effective_from: input.effectiveFrom,
    }
  );
  revalidatePath("/manager/payroll");
  return { success: true };
}

export async function endStaffRateAction(input: {
  staffId: string;
  effectiveUntil: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  const result = await endStaffRate(input.staffId, input.effectiveUntil);
  if (!result.success) return { success: false, error: result.error };
  await writePayrollAuditLog(
    "payroll.rate.ended",
    null,
    current.staff.id,
    { staff_id: input.staffId, effective_until: input.effectiveUntil }
  );
  return { success: true };
}

export async function upsertRateRuleAction(
  input: UpsertRateRuleInput
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  const result = await upsertRateRuleRow(input);
  if (!result.success) return { success: false, error: result.error };
  await writePayrollAuditLog(
    "payroll.rate_rule.upserted",
    result.rule?.id ?? null,
    current.staff.id,
    { ...input }
  );
  return { success: true };
}

export async function removeRateRuleAction(
  ruleId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  const result = await removeRateRule(ruleId);
  if (!result.success) return { success: false, error: result.error };
  await writePayrollAuditLog(
    "payroll.rate_rule.removed",
    ruleId,
    current.staff.id,
    {}
  );
  return { success: true };
}

export async function setOvertimeRulesAction(input: {
  weeklyThresholdHours?: number | null;
  weeklyOtMultiplier?: number;
  dailyThresholdHours?: number | null;
  dailyOtMultiplier?: number;
  restDayMultiplier?: number;
  publicHolidayMultiplier?: number;
  restDayStrategy?: RestDayStrategy;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  const result = await updateOvertimeRules({
    weekly_threshold_hours: input.weeklyThresholdHours,
    weekly_ot_multiplier: input.weeklyOtMultiplier,
    daily_threshold_hours: input.dailyThresholdHours,
    daily_ot_multiplier: input.dailyOtMultiplier,
    rest_day_multiplier: input.restDayMultiplier,
    public_holiday_multiplier: input.publicHolidayMultiplier,
    rest_day_strategy: input.restDayStrategy,
  });
  if (!result) return { success: false, error: "Update failed" };
  await writePayrollAuditLog(
    "payroll.overtime_rules.updated",
    result.id,
    current.staff.id,
    { ...input }
  );
  return { success: true };
}

export async function upsertHolidayAction(input: {
  date: string;
  name: string;
  isActive: boolean;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  const result = await upsertHoliday({
    date: input.date,
    name: input.name,
    is_active: input.isActive,
  });
  if (!result.success) return { success: false, error: result.error };
  await writePayrollAuditLog(
    "payroll.holiday.upserted",
    null,
    current.staff.id,
    { date: input.date, name: input.name, is_active: input.isActive }
  );
  return { success: true };
}

export async function removeHolidayAction(
  date: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }
  const result = await removeHoliday(date);
  if (!result.success) return { success: false, error: result.error };
  await writePayrollAuditLog(
    "payroll.holiday.removed",
    null,
    current.staff.id,
    { date }
  );
  return { success: true };
}
