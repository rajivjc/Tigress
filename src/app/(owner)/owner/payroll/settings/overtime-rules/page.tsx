import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { getOvertimeRules } from "@/scheduling/payroll/data/overtime-rules";
import { PayrollSettingsNav } from "@/components/payroll/PayrollSettingsNav";
import { PayrollOvertimeRulesForm } from "@/components/payroll/owner/PayrollOvertimeRulesForm";

export const dynamic = "force-dynamic";

export default async function PayrollOvertimeRulesPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/floor");

  const rules = await getOvertimeRules();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-zinc-100">Payroll settings</h1>
        <p className="text-sm text-zinc-400">
          Application order: PH &gt; rest day &gt; daily OT &gt; weekly OT &gt; regular.
          Each clock-record-hour goes into exactly one bucket.
        </p>
      </header>
      <PayrollSettingsNav />
      <PayrollOvertimeRulesForm rules={rules} />
    </div>
  );
}
