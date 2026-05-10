import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { listHolidays } from "@/scheduling/payroll/data/holidays";
import { PayrollSettingsNav } from "@/components/payroll/PayrollSettingsNav";
import { PayrollHolidaysEditor } from "@/components/payroll/owner/PayrollHolidaysEditor";

export const dynamic = "force-dynamic";

export default async function PayrollHolidaysPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const holidays = await listHolidays(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Payroll settings</h1>
        <p className="text-sm text-zinc-400">
          Public holidays — used by the OT classifier to apply the public
          holiday multiplier to in-period clock records.
        </p>
      </header>
      <PayrollSettingsNav />
      <PayrollHolidaysEditor holidays={holidays} />
    </div>
  );
}
