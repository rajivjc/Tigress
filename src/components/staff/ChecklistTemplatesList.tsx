"use client";

// =============================================================================
// ChecklistTemplatesList
// =============================================================================
// Manager/owner list of checklist templates with active-toggle and delete.
// Inactive templates are greyed out but still visible so they can be restored.
// =============================================================================

import Link from "next/link";
import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import {
  deleteChecklistTemplateAction,
  updateChecklistTemplateAction,
} from "@/app/actions/checklists";
import type { ChecklistTemplateWithItems } from "@/lib/types/checklists";

export interface ChecklistTemplatesListProps {
  templates: ChecklistTemplateWithItems[];
}

const CATEGORY_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  ad_hoc: "Ad-hoc",
};

export function ChecklistTemplatesList({
  templates,
}: ChecklistTemplatesListProps) {
  // Local copy so toggling re-renders optimistically.
  const [rows, setRows] = useState(templates);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleToggleActive = (templateId: string, nextActive: boolean) => {
    setError(null);
    setRows((prev) =>
      prev.map((r) =>
        r.template.id === templateId
          ? { ...r, template: { ...r.template, is_active: nextActive } }
          : r
      )
    );
    startTransition(async () => {
      const res = await updateChecklistTemplateAction(templateId, {
        is_active: nextActive,
      });
      if (!res.success) {
        setError(res.error ?? "Failed to update template");
        // Roll back.
        setRows((prev) =>
          prev.map((r) =>
            r.template.id === templateId
              ? {
                  ...r,
                  template: { ...r.template, is_active: !nextActive },
                }
              : r
          )
        );
      }
    });
  };

  const handleDelete = (templateId: string) => {
    if (
      !confirm(
        "Archive this template? It will stop generating daily checklists but past records are preserved."
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteChecklistTemplateAction(templateId);
      if (!res.success) {
        setError(res.error ?? "Failed to archive template");
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.template.id === templateId
            ? { ...r, template: { ...r.template, is_active: false } }
            : r
        )
      );
    });
  };

  const sorted = [...rows].sort((a, b) => {
    if (a.template.is_active !== b.template.is_active) {
      return a.template.is_active ? -1 : 1;
    }
    return a.template.sort_order - b.template.sort_order;
  });

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}
      <ul className="space-y-2">
        {sorted.map(({ template, items }) => {
          const inactive = !template.is_active;
          return (
            <li
              key={template.id}
              className={`rounded-xl border border-white/10 bg-surface-1 p-3 transition-opacity ${
                inactive ? "opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      {template.name}
                    </h3>
                    <span className="rounded-full border border-white/10 bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50">
                      {CATEGORY_LABEL[template.category] ?? "Daily"}
                    </span>
                    {inactive && (
                      <span className="rounded-full border border-white/10 bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/40">
                        Inactive
                      </span>
                    )}
                  </div>
                  {template.description && (
                    <p className="mt-1 text-xs text-white/50">
                      {template.description}
                    </p>
                  )}
                  <p className="mt-1 text-[11px] text-white/40">
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/checklists/templates/${template.id}`}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-2 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5"
                  >
                    <Pencil size={12} strokeWidth={1.5} />
                    Edit
                  </Link>
                  {template.is_active ? (
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-2 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
                    >
                      <Archive size={12} strokeWidth={1.5} />
                      Archive
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleActive(template.id, true)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      <ArchiveRestore size={12} strokeWidth={1.5} />
                      Restore
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
