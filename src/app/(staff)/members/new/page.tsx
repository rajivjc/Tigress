import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { NewMemberForm } from "@/components/staff/NewMemberForm";
import { getAllTiers } from "@/lib/data/members";
import { getCurrentStaff } from "@/lib/data/staff";

export const dynamic = "force-dynamic";

export default async function NewMemberPage() {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }
  if (current.role !== "owner") {
    return <AccessDenied />;
  }

  const tiers = await getAllTiers();

  return <NewMemberForm tiers={tiers} />;
}
