import { notFound, redirect } from "next/navigation";
import { ChecklistTemplateEditor } from "@/components/staff/ChecklistTemplateEditor";
import { getChecklistTemplate } from "@/lib/data/checklists";
import { getCurrentStaff } from "@/lib/data/staff";
import { AccessDenied } from "@/components/ui/AccessDenied";

export const dynamic = "force-dynamic";

interface EditTemplatePageProps {
  params: { id: string };
}

export default async function EditChecklistTemplatePage({
  params,
}: EditTemplatePageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    return <AccessDenied />;
  }

  const template = await getChecklistTemplate(params.id);
  if (!template) notFound();

  return <ChecklistTemplateEditor mode="edit" initial={template} />;
}
