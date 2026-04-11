import { redirect } from "next/navigation";
import { BlockForm } from "@/components/staff/BlockForm";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { getCurrentStaff } from "@/lib/data/staff";
import { getTablesWithStatus } from "@/lib/data/tables";

export const dynamic = "force-dynamic";

interface BlockPageProps {
  searchParams: { table?: string };
}

export default async function BlockSlotPage({ searchParams }: BlockPageProps) {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }
  if (current.role !== "manager" && current.role !== "owner") {
    return <AccessDenied />;
  }

  const tables = (await getTablesWithStatus()).map((t) => ({
    id: t.id,
    table_number: t.table_number,
  }));

  return <BlockForm tables={tables} initialTableId={searchParams.table} />;
}
