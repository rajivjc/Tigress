import { redirect } from "next/navigation";
import { getCurrentStaff, listAllStaff } from "@/lib/data/staff";
import { listAllQualifications } from "@/scheduling/data/qualifications";
import { listFtAssignments } from "@/scheduling/data/ft-assignments";
import { listShiftTemplates } from "@/scheduling/data/templates";
import { UsersClient } from "@/components/scheduling/UsersClient";

export const dynamic = "force-dynamic";

export default async function ManagerUsersPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    redirect("/staff/schedule");
  }

  const [staff, qualifications, ftAssignments, templates] = await Promise.all([
    listAllStaff(),
    listAllQualifications(),
    listFtAssignments(),
    listShiftTemplates(),
  ]);

  return (
    <UsersClient
      staff={staff}
      qualifications={qualifications}
      ftAssignments={ftAssignments}
      templates={templates}
    />
  );
}
