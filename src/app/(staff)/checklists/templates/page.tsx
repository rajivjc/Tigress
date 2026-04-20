import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { getChecklistTemplates } from "@/lib/data/checklists";
import { getCurrentStaff } from "@/lib/data/staff";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChecklistTemplatesList } from "@/components/staff/ChecklistTemplatesList";

export const dynamic = "force-dynamic";

export default async function ChecklistTemplatesPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    return <AccessDenied />;
  }

  const templates = await getChecklistTemplates();

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/checklists"
            className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/40 hover:text-white/70"
          >
            <ArrowLeft size={12} strokeWidth={1.5} />
            Checklists
          </Link>
          <h1 className="text-xl font-bold text-white">Checklist Templates</h1>
          <p className="mt-0.5 text-xs text-white/50">
            Templates generate today&apos;s checklists automatically.
          </p>
        </div>
        <Link
          href="/checklists/templates/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 active:scale-[0.98]"
        >
          <Plus size={14} strokeWidth={2} />
          New template
        </Link>
      </header>

      {templates.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No templates yet"
          description="Create one to start tracking opening / closing routines."
          actionLabel="Create template"
          actionHref="/checklists/templates/new"
        />
      ) : (
        <ChecklistTemplatesList templates={templates} />
      )}
    </div>
  );
}
