"use client";

// =============================================================================
// ChecklistHistoryClient
// =============================================================================
// Manager/owner history view. Date-range filter + optional template filter.
// Each row shows completion status; tapping a row reveals the per-item state
// so managers can audit who did what.
// =============================================================================

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Circle } from "lucide-react";
import {
  getChecklistHistoryAction,
  getChecklistInstanceItemsAction,
} from "@/app/actions/checklists";
import { formatTime } from "@/lib/format";
import type {
  ChecklistInstanceItem,
  ChecklistInstanceSummary,
} from "@/lib/types/checklists";

export interface ChecklistHistoryClientProps {
  initialHistory: ChecklistInstanceSummary[];
  templates: { id: string; name: string }[];
  initialStart: string;
  initialEnd: string;
  initialTemplateId?: string;
}

export function ChecklistHistoryClient({
  initialHistory,
  templates,
  initialStart,
  initialEnd,
  initialTemplateId,
}: ChecklistHistoryClientProps) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [templateId, setTemplateId] = useState(initialTemplateId ?? "");
  const [history, setHistory] = useState(initialHistory);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refetch = () => {
    setError(null);
    startTransition(async () => {
      const res = await getChecklistHistoryAction({
        startDate: start,
        endDate: end,
        templateId: templateId || undefined,
      });
      if (res.error) {
        setError(res.error);
        setHistory([]);
      } else {
        setHistory(res.history ?? []);
      }
    });
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          refetch();
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-4"
      >
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
            From
          </span>
          <input
            type="date"
            value={start}
            max={end}
            onChange={(e) => setStart(e.target.value || start)}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
            To
          </span>
          <input
            type="date"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value || end)}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
            Template
          </span>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            <option value="">All templates</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-40"
          >
            {pending ? "Loading…" : "Apply"}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {history.length === 0 && !pending ? (
        <p className="rounded-xl border border-white/10 bg-surface-1 p-6 text-center text-sm text-white/50">
          No checklist instances in this range.
        </p>
      ) : (
        <ul className="space-y-2">
          {history.map((row) => {
            const isComplete =
              row.completed_at !== null && row.items_total > 0;
            const isExpanded = expandedId === row.instance_id;
            return (
              <li
                key={row.instance_id}
                className="overflow-hidden rounded-xl border border-white/10 bg-surface-1"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : row.instance_id)
                  }
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isComplete ? (
                      <CheckCircle2
                        size={18}
                        strokeWidth={1.5}
                        className="shrink-0 text-emerald-400"
                      />
                    ) : (
                      <Circle
                        size={18}
                        strokeWidth={1.5}
                        className="shrink-0 text-white/30"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {row.template_name}
                      </p>
                      <p className="text-xs text-white/50">
                        {formatReadableDate(row.date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right text-xs">
                      <p
                        className={`font-medium ${
                          isComplete
                            ? "text-emerald-300"
                            : "text-white/70"
                        }`}
                      >
                        {row.items_checked}/{row.items_total}
                      </p>
                      {isComplete && row.completed_at && (
                        <p className="text-[10px] text-white/40">
                          {row.completed_by_name
                            ? `${row.completed_by_name} · `
                            : ""}
                          {formatTime(row.completed_at)}
                        </p>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronDown
                        size={16}
                        strokeWidth={1.5}
                        className="text-white/40"
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                        strokeWidth={1.5}
                        className="text-white/40"
                      />
                    )}
                  </div>
                </button>
                {isExpanded && (
                  <ChecklistInstanceDetail instanceId={row.instance_id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// =============================================================================
// Detail loader — fetched on expand so the initial history list stays tight.
// =============================================================================

function ChecklistInstanceDetail({ instanceId }: { instanceId: string }) {
  const [items, setItems] = useState<ChecklistInstanceItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getChecklistInstanceItemsAction(instanceId).then((res) => {
      if (cancelled) return;
      if (res.error) setLoadError(res.error);
      else setItems(res.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [instanceId]);

  if (loadError) {
    return (
      <p className="border-t border-white/5 p-3 text-xs text-red-300">
        {loadError}
      </p>
    );
  }
  if (!items) {
    return (
      <p className="border-t border-white/5 p-3 text-xs text-white/40">
        Loading…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="border-t border-white/5 p-3 text-xs text-white/40">
        No items recorded.
      </p>
    );
  }

  return (
    <ul className="border-t border-white/5 divide-y divide-white/5">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 px-3 py-2">
          {item.checked ? (
            <CheckCircle2
              size={14}
              strokeWidth={1.5}
              className="mt-0.5 shrink-0 text-emerald-400"
            />
          ) : (
            <Circle
              size={14}
              strokeWidth={1.5}
              className="mt-0.5 shrink-0 text-white/30"
            />
          )}
          <div className="min-w-0 flex-1">
            <p
              className={`text-xs ${
                item.checked ? "text-white/60 line-through" : "text-white/80"
              }`}
            >
              {item.label}
            </p>
            {item.checked && item.checked_at && (
              <p className="text-[10px] text-white/40">
                {formatTime(item.checked_at)}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatReadableDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
