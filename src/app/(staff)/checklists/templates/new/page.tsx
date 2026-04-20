import { redirect } from "next/navigation";
import { ChecklistTemplateEditor } from "@/components/staff/ChecklistTemplateEditor";
import { getCurrentStaff } from "@/lib/data/staff";
import { AccessDenied } from "@/components/ui/AccessDenied";

export const dynamic = "force-dynamic";

export default async function NewChecklistTemplatePage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    return <AccessDenied />;
  }

  return <ChecklistTemplateEditor mode="create" />;
}
