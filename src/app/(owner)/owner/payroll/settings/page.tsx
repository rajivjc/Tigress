import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { getSettings } from "@/scheduling/payroll/data/settings";
import { PayrollSettingsNav } from "@/components/payroll/PayrollSettingsNav";
import { PayrollGeneralSettingsForm } from "@/components/payroll/owner/PayrollGeneralSettingsForm";

export const dynamic = "force-dynamic";

export default async function PayrollSettingsGeneralPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Payroll settings</h1>
        <p className="text-sm text-zinc-400">
          Owner-only configuration for the payroll engine and exports.
        </p>
      </header>
      <PayrollSettingsNav />
      <PayrollGeneralSettingsForm settings={settings} />
    </div>
  );
}
