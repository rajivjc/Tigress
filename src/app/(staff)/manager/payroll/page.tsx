import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentStaff } from "@/lib/data/staff";
import { listRuns } from "@/scheduling/payroll/data/runs";
import { listLineItemsForRun } from "@/scheduling/payroll/data/line-items";
import { PayrollRunCreator } from "@/components/payroll/PayrollRunCreator";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

export default async function ManagerPayrollPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    redirect("/staff/schedule");
  }

  const runs = await listRuns();
  const summaries = await Promise.all(
    runs.map(async (run) => {
      const items = await listLineItemsForRun(run.id);
      const gross = items.reduce((sum, i) => sum + (i.amount > 0 ? i.amount : 0), 0);
      const net = items.reduce((sum, i) => sum + i.amount, 0);
      const staffCount = new Set(items.map((i) => i.staff_id)).size;
      return { run, gross, net, staffCount };
    })
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Payroll</h1>
          <p className="text-sm text-zinc-400">
            One run per pay period. Lifecycle: draft → review → locked.
          </p>
        </div>
        <PayrollRunCreator />
      </div>

      {summaries.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 text-center text-zinc-400">
          No payroll runs yet. Create one for the current period to begin.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900/60 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Period</th>
                <th className="px-3 py-2 font-medium">Payment</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Staff</th>
                <th className="px-3 py-2 text-right font-medium">Gross</th>
                <th className="px-3 py-2 text-right font-medium">Net</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {summaries.map(({ run, gross, net, staffCount }) => (
                <tr key={run.id}>
                  <td className="px-3 py-2 text-zinc-200">
                    {run.period_start} – {run.period_end}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{run.payment_date}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        run.status === "draft"
                          ? "rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300"
                          : run.status === "review"
                          ? "rounded bg-sky-500/15 px-2 py-0.5 text-xs text-sky-300"
                          : "rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"
                      }
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-300">{staffCount}</td>
                  <td className="px-3 py-2 text-right text-zinc-300">
                    {formatCurrency(gross)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-200">
                    {formatCurrency(net)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/manager/payroll/runs/${run.id}`}
                      className="text-rose-400 hover:underline"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
