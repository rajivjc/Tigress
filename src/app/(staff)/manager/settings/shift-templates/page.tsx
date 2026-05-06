import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  listDayCoverage,
  listShiftTemplates,
} from "@/scheduling/data/templates";
import { ShiftTemplatesClient } from "@/components/scheduling/ShiftTemplatesClient";

export const dynamic = "force-dynamic";

export default async function ShiftTemplatesPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    redirect("/staff/schedule");
  }

  const [templates, dayCoverage] = await Promise.all([
    listShiftTemplates(),
    listDayCoverage(),
  ]);

  return (
    <ShiftTemplatesClient templates={templates} dayCoverage={dayCoverage} />
  );
}
