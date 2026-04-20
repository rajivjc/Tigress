import { redirect } from "next/navigation";
import { ChecklistsClient } from "@/components/staff/ChecklistsClient";
import { getChecklistsForDate } from "@/lib/data/checklists";
import { getCurrentStaff } from "@/lib/data/staff";
import { todaySGT } from "@/lib/timezone";

export const dynamic = "force-dynamic";

interface ChecklistsPageProps {
  searchParams: { date?: string };
}

export default async function ChecklistsPage({
  searchParams,
}: ChecklistsPageProps) {
  const current = await getCurrentStaff();
  if (!current) {
    redirect("/login");
  }

  const today = todaySGT();
  const date = searchParams.date || today;
  const checklists = await getChecklistsForDate(date);
  const canManage = current.role === "manager" || current.role === "owner";

  return (
    <ChecklistsClient
      initialChecklists={checklists}
      initialDate={date}
      today={today}
      canManage={canManage}
    />
  );
}
