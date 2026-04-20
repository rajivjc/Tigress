import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  getChecklistHistory,
  getChecklistTemplates,
} from "@/lib/data/checklists";
import { getCurrentStaff } from "@/lib/data/staff";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { ChecklistHistoryClient } from "@/components/staff/ChecklistHistoryClient";
import { addDaysSGT, todaySGT } from "@/lib/timezone";

export const dynamic = "force-dynamic";

interface HistoryPageProps {
  searchParams: { start?: string; end?: string; template?: string };
}

export default async function ChecklistHistoryPage({
  searchParams,
}: HistoryPageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    return <AccessDenied />;
  }

  const today = todaySGT();
  const start = searchParams.start || addDaysSGT(today, -6);
  const end = searchParams.end || today;
  const templateId = searchParams.template;

  const [history, templates] = await Promise.all([
    getChecklistHistory({
      startDate: start,
      endDate: end,
      templateId,
    }),
    getChecklistTemplates(),
  ]);

  return (
    <div className="space-y-4 p-4">
      <header>
        <Link
          href="/checklists"
          className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/40 hover:text-white/70"
        >
          <ArrowLeft size={12} strokeWidth={1.5} />
          Checklists
        </Link>
        <h1 className="text-xl font-bold text-white">History</h1>
        <p className="mt-0.5 text-xs text-white/50">
          Verify that daily routines were completed.
        </p>
      </header>

      <ChecklistHistoryClient
        initialHistory={history}
        templates={templates.map((t) => ({
          id: t.template.id,
          name: t.template.name,
        }))}
        initialStart={start}
        initialEnd={end}
        initialTemplateId={templateId}
      />
    </div>
  );
}
