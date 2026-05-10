import { redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { listAllRates } from "@/scheduling/payroll/data/rates";
import { PayrollSettingsNav } from "@/components/payroll/PayrollSettingsNav";
import { PayrollRatesEditor } from "@/components/payroll/owner/PayrollRatesEditor";

export const dynamic = "force-dynamic";

export default async function PayrollRatesPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const [staff, rates] = await Promise.all([listAllStaff(), listAllRates()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Payroll settings</h1>
        <p className="text-sm text-zinc-400">
          Per-staff hourly rate. Setting a new rate closes the prior open row.
        </p>
      </header>
      <PayrollSettingsNav />
      <PayrollRatesEditor
        staff={staff.map((s) => ({ id: s.id, full_name: s.full_name }))}
        rates={rates}
      />
    </div>
  );
}
