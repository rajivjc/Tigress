"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { writePayrollAuditLog } from "../audit";
import { getBranding, updateBranding } from "../data/branding";
import type { PayrollVenueBranding } from "../types";

function isOwner(role: string): boolean {
  return role === "owner";
}

function isStaff(role: string): boolean {
  return role === "staff" || role === "manager" || role === "owner";
}

export async function getBrandingAction(): Promise<{
  success: boolean;
  branding?: PayrollVenueBranding;
  error?: string;
}> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isStaff(current.role)) {
    return { success: false, error: "Staff role required" };
  }
  const branding = await getBranding();
  if (!branding) return { success: false, error: "Branding not configured" };
  return { success: true, branding };
}

export async function updateBrandingAction(input: {
  venueName?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isOwner(current.role)) {
    return { success: false, error: "Owner role required" };
  }

  // Build the patch with only the fields the caller actually supplied, so
  // omitted fields keep their existing value. Passing `undefined` through to
  // Object.assign in the data layer would clobber the existing value.
  const patch: Parameters<typeof updateBranding>[0] = {};
  if (input.venueName !== undefined) patch.venue_name = input.venueName;
  if (input.address !== undefined) patch.address = input.address;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone;
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;

  const result = await updateBranding(patch);
  if (!result) return { success: false, error: "Update failed" };

  await writePayrollAuditLog(
    "payroll.branding.updated",
    result.id,
    current.staff.id,
    { ...input }
  );
  revalidatePath("/owner/payroll/settings/branding");
  // Branding affects every rendered payslip; refresh the staff payslip
  // routes so a freshly-rendered PDF picks up the new venue header.
  revalidatePath("/staff/payroll");
  return { success: true };
}
