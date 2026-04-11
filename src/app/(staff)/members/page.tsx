import { redirect } from "next/navigation";
import { MembersList } from "@/components/staff/MembersList";
import { getAllMembers } from "@/lib/data/members";
import { getCurrentStaff } from "@/lib/data/staff";

export const dynamic = "force-dynamic";

export default async function StaffMembersPage() {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }

  const members = await getAllMembers();

  return (
    <MembersList
      initialMembers={members}
      canCreateMembers={current.role === "owner"}
    />
  );
}
