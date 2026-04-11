import { redirect } from "next/navigation";
import { StaffFloorView } from "@/components/floorplan/StaffFloorView";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  getTablesWithStatus,
  getTodayActivity,
} from "@/lib/data/tables";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }

  const [tables, activity] = await Promise.all([
    getTablesWithStatus(),
    getTodayActivity(),
  ]);

  return (
    <StaffFloorView
      initialTables={tables}
      userRole={current.role}
      todayActivity={activity}
    />
  );
}
