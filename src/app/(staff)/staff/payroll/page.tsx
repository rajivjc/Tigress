import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { listRuns } from "@/scheduling/payroll/data/runs";
import { listLineItemsForRun } from "@/scheduling/payroll/data/line-items";
import { getSettings } from "@/scheduling/payroll/data/settings";

export const dynamic = "force-dynamic";

export default async function StaffPayrollIndexPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const [runs, settings] = await Promise.all([listRuns(), getSettings()]);
  const lockedRuns = runs.filter((r) => r.status === "locked");
  const myStaffId = current.staff.id;
  const currency = settings?.currency ?? "SGD";

  // Per-run quick totals for the listing — pulled from the per-run line
  // items so the staff sees their own gross/net at a glance without
  // navigating into the detail.
  const myRuns = await Promise.all(
    lockedRuns.map(async (run) => {
      const items = await listLineItemsForRun(run.id);
      const mine = items.filter((i) => i.staff_id === myStaffId);
      const gross = mine.reduce((s, i) => (i.amount > 0 ? s + i.amount : s), 0);
      const net = mine.reduce((s, i) => s + i.amount, 0);
      return { run, hasItems: mine.length > 0, gross, net };
    })
  );
  const visible = myRuns.filter((r) => r.hasItems);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Payslips</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Finalised pay periods, most recent first.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
          No payslips yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map(({ run, gross, net }) => (
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
