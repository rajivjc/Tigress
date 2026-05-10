import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { getBranding } from "@/scheduling/payroll/data/branding";
import { PayrollSettingsNav } from "@/components/payroll/PayrollSettingsNav";
import { PayrollBrandingForm } from "@/components/payroll/owner/PayrollBrandingForm";

export const dynamic = "force-dynamic";

export default async function PayrollBrandingPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const branding = await getBranding();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Payroll settings</h1>
        <p className="text-sm text-zinc-400">
          Branding shown at the top of every PDF payslip and the staff
          payslip view.
        </p>
      </header>
      <PayrollSettingsNav />
      <PayrollBrandingForm branding={branding} />
    </div>
  );
}
