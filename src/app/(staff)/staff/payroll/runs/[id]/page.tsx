import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import { getStaffPayslipAction } from "@/scheduling/payroll/actions/export";
import { StaffPayslipClient } from "@/components/payroll/StaffPayslipClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default async function StaffPayslipPage({ params }: PageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const r = await getStaffPayslipAction({ runId: params.id });
  if (!r.success || !r.doc) {
    if (r.error === "Run not found") notFound();
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        <h1 className="text-2xl font-semibold text-zinc-100">Payslip</h1>
        <p className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
          {r.error ?? "Payslip unavailable"}
        </p>
      </div>
    );
  }

  return <StaffPayslipClient doc={r.doc} runId={params.id} />;
}
