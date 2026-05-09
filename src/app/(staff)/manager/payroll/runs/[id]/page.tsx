import { notFound, redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { getRun } from "@/scheduling/payroll/data/runs";
import { listLineItemsForRun } from "@/scheduling/payroll/data/line-items";
import { PayrollRunClient } from "@/components/payroll/PayrollRunClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: { id: string };
}

export default async function PayrollRunPage({ params }: PageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    redirect("/staff/schedule");
  }

  const run = await getRun(params.id);
  if (!run) notFound();

  const [items, allStaff] = await Promise.all([
    listLineItemsForRun(params.id),
    listAllStaff(),
  ]);

  return (
    <PayrollRunClient
      run={run}
      lineItems={items}
      staff={allStaff.map((s) => ({ id: s.id, full_name: s.full_name }))}
      isOwner={current.role === "owner"}
    />
  );
}
