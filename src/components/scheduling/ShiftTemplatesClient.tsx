"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  deleteShiftTemplateAction,
  removeTemplateDayCoverageAction,
  setTemplateDayCoverageAction,
  upsertShiftTemplateAction,
} from "@/scheduling/actions/templates";
import type {
  Qualification,
  ShiftTemplate,
  TemplateDayCoverage,
} from "@/scheduling/types";
import { QUALIFICATIONS } from "@/scheduling/types";

interface Props {
  templates: ShiftTemplate[];
  dayCoverage: TemplateDayCoverage[];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ShiftTemplatesClient({ templates, dayCoverage }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  const [formName, setFormName] = useState("");
  const [formStart, setFormStart] = useState("10:00");
  const [formEnd, setFormEnd] = useState("18:00");

  const refresh = () => router.refresh();

  const startEdit = (t: ShiftTemplate) => {
    setEditing(t);
    setFormName(t.name);
    setFormStart(t.start_time.slice(0, 5));
    setFormEnd(t.end_time.slice(0, 5));
  };

  const startCreate = () => {
    setEditing({
      id: "",
      name: "",
      start_time: "10:00:00",
      end_time: "18:00:00",
      sort_order: 0,
      is_active: true,
      created_at: "",
      updated_at: "",
    });
    setFormName("");
    setFormStart("10:00");
    setFormEnd("18:00");
  };

  const handleSave = () => {
    if (!editing) return;
    if (!formName.trim()) {
      setError("Name is required");
      return;
    }
    if (formEnd <= formStart) {
      setError("End time must be after start");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await upsertShiftTemplateAction({
        id: editing.id || undefined,
        name: formName,
        start_time: formStart + ":00",
        end_time: formEnd + ":00",
      });
      if (!r.success) setError(r.error ?? "Failed");
      else {
        setEditing(null);
        refresh();
      }
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Archive this template?")) return;
    startTransition(async () => {
      const r = await deleteShiftTemplateAction(id);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  const handleSetCoverage = (
    templateId: string,
    dow: number,
    requirements: Partial<Record<Qualification, number>>
  ) => {
    startTransition(async () => {
      const hasAny = Object.values(requirements).some(
        (v) => typeof v === "number" && v > 0
      );
      const r = hasAny
        ? await setTemplateDayCoverageAction(templateId, dow, requirements)
        : await removeTemplateDayCoverageAction(templateId, dow);
      if (!r.success) setError(r.error ?? "Failed");
      else refresh();
    });
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Manager
          </p>
          <h1 className="text-xl font-bold text-white">Shift templates</h1>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          <Plus size={14} strokeWidth={1.5} />
          New template
        </button>
      </header>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      {editing && (
        <div className="space-y-2 rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <h2 className="text-sm font-semibold text-white">
            {editing.id ? "Edit template" : "New template"}
          </h2>
          <input
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="Name e.g. AM"
            className="w-full rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-sm text-white"
          />
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={formStart}
              onChange={(e) => setFormStart(e.target.value)}
              className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-sm text-white"
            />
            <span className="text-white/40">–</span>
            <input
              type="time"
              value={formEnd}
              onChange={(e) => setFormEnd(e.target.value)}
              className="rounded-md border border-white/10 bg-surface-2 px-2 py-1 text-sm text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            dayCoverage={dayCoverage.filter((c) => c.template_id === t.id)}
            onEdit={() => startEdit(t)}
            onDelete={() => handleDelete(t.id)}
            onSetCoverage={handleSetCoverage}
          />
        ))}
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: ShiftTemplate;
  dayCoverage: TemplateDayCoverage[];
  onEdit: () => void;
  onDelete: () => void;
  onSetCoverage: (
    templateId: string,
    dow: number,
    requirements: Partial<Record<Qualification, number>>
  ) => void;
}

function TemplateCard({
  template,
  dayCoverage,
  onEdit,
  onDelete,
  onSetCoverage,
}: TemplateCardProps) {
  const coverageByDay = new Map(
    dayCoverage.map((c) => [c.day_of_week, c.role_requirements])
  );

  const handleChange = (
    dow: number,
    role: Qualification,
    nextValue: number
  ) => {
    const current = coverageByDay.get(dow) ?? {};
    const updated = { ...current, [role]: nextValue };
    onSetCoverage(template.id, dow, updated);
  };

  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-surface-1 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            {template.name}
            {!template.is_active && (
              <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50">
                inactive
              </span>
            )}
          </h2>
          <p className="text-xs text-white/50">
            {template.start_time.slice(0, 5)}–{template.end_time.slice(0, 5)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md border border-white/10 bg-surface-2 px-3 py-1 text-xs text-white/70"
          >
            Edit
          </button>
          {template.is_active && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-rose-500/30 bg-surface-2 px-3 py-1 text-xs text-rose-300"
            >
              <Trash2 size={12} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-white/40">
              <th className="pb-2 text-left">Day</th>
              {QUALIFICATIONS.map((r) => (
                <th key={r} className="pb-2 text-center capitalize">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_LABELS.map((label, dow) => {
              const reqs = coverageByDay.get(dow) ?? {};
              return (
                <tr key={dow} className="border-t border-white/5">
                  <td className="py-1.5 text-white/70">{label}</td>
                  {QUALIFICATIONS.map((role) => (
                    <td key={role} className="py-1.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={9}
                        defaultValue={reqs[role] ?? 0}
                        onBlur={(e) => {
                          const next = Number.parseInt(e.target.value, 10);
                          handleChange(dow, role, Number.isNaN(next) ? 0 : next);
                        }}
                        className="w-12 rounded border border-white/10 bg-surface-2 px-1 py-0.5 text-center text-white"
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
