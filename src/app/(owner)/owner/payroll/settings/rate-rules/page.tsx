import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { listRateRules } from "@/scheduling/payroll/data/rate-rules";
import { PayrollSettingsNav } from "@/components/payroll/PayrollSettingsNav";
import { PayrollRateRulesEditor } from "@/components/payroll/owner/PayrollRateRulesEditor";

export const dynamic = "force-dynamic";

export default async function PayrollRateRulesPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const rules = await listRateRules();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Payroll settings</h1>
        <p className="text-sm text-zinc-400">
          Multipliers stack multiplicatively — role multipliers + time-of-day
          multipliers compose with the base hourly rate.
        </p>
      </header>
      <PayrollSettingsNav />
      <PayrollRateRulesEditor rules={rules} />
    </div>
  );
}
