import { redirect } from "next/navigation";
import { StaffFloorView } from "@/components/floorplan/StaffFloorView";
import { PageTransition } from "@/components/ui/PageTransition";
import { getCurrentStaff } from "@/lib/data/staff";
import {
  getTablesWithStatus,
  getTodayActivity,
} from "@/lib/data/tables";
import { completeExpiredBookings } from "@/lib/data/bookings";

export const dynamic = "force-dynamic";

export default async function FloorPage() {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }

  // Opportunistic sweep: flip any confirmed bookings whose end time has
  // passed into `completed` before we read the floor state.
  await completeExpiredBookings();

  const [tables, activity] = await Promise.all([
    getTablesWithStatus(),
    getTodayActivity(),
  ]);

  return (
    <PageTransition>
      <StaffFloorView
        initialTables={tables}
        userRole={current.role}
        todayActivity={activity}
      />
    </PageTransition>
  );
}
