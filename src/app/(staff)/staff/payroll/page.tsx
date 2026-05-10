import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { getStaffPayslipsSummaryAction } from "@/scheduling/payroll/actions/export";

export const dynamic = "force-dynamic";

export default async function StaffPayrollIndexPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const r = await getStaffPayslipsSummaryAction();
  if (!r.success || !r.summaries) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Payslips</h1>
        </div>
        <p className="rounded border border-rose-700 bg-rose-900/30 p-6 text-center text-sm text-rose-200">
          {r.error ?? "Could not load payslips."}
        </p>
      </div>
    );
  }

  const summaries = r.summaries;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Payslips</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Finalised pay periods, most recent first.
        </p>
      </div>

      {summaries.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
          No payslips yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {summaries.map(({ run, gross, net, currency }) => (
            <li key={run.id}>
              <Link
                href={`/staff/payroll/runs/${run.id}`}
                className="flex items-baseline justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 hover:border-rose-500/40"
              >
                <div>
                  <p className="font-medium text-zinc-100">
                    {run.period_start} — {run.period_end}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Payment date {run.payment_date}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-zinc-500">Net</p>
                  <p className="text-lg text-zinc-100">
                    {currency} {net.toFixed(2)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Gross {currency} {gross.toFixed(2)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
