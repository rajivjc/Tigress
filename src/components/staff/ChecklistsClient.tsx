"use client";

// =============================================================================
// ChecklistsClient
// =============================================================================
// Interactive daily checklists UI. Receives the prefetched instances and lets
// staff tick items off via `toggleChecklistItemAction`. Past dates are shown
// read-only so staff can review what was done. Manager/owner see extra links
// for template management and history.
// =============================================================================

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  History,
  Settings2,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatTime } from "@/lib/format";
import {
  getChecklistsForDateAction,
  toggleChecklistItemAction,
} from "@/app/actions/checklists";
import type {
  ChecklistInstanceItem,
  ChecklistInstanceWithItems,
} from "@/lib/types/checklists";

export interface ChecklistsClientProps {
  initialChecklists: ChecklistInstanceWithItems[];
  initialDate: string;
  today: string;
  canManage: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  ad_hoc: "Ad-hoc",
};

export function ChecklistsClient({
  initialChecklists,
  initialDate,
  today,
  canManage,
}: ChecklistsClientProps) {
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [checklists, setChecklists] =
    useState<ChecklistInstanceWithItems[]>(initialChecklists);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readOnly = date !== today;

  const refetch = async (nextDate: string) => {
    setLoading(true);
    setError(null);
    const res = await getChecklistsForDateAction(nextDate);
    if (res.error) {
      setError(res.error);
      setChecklists([]);
    } else {
      setChecklists(res.checklists ?? []);
    }
    setLoading(false);
  };

  const handleDateChange = (value: string) => {
    if (!value) return;
    setDate(value);
    refetch(value);
  };

  const handleItemToggle = (itemId: string, instanceId: string) => {
    setChecklists((prev) =>
      prev.map((group) => {
        if (group.instance.id !== instanceId) return group;
        const nextItems = group.items.map((it) =>
          it.id === itemId
            ? {
                ...it,
                checked: !it.checked,
                checked_by: it.checked ? null : "self",
                checked_at: it.checked ? null : new Date().toISOString(),
              }
            : it
        );
        const allComplete = nextItems.every((i) => i.checked);
        return {
          ...group,
          items: nextItems,
          instance: {
            ...group.instance,
            completed_at: allComplete
              ? new Date().toISOString()
              : null,
            completed_by: allComplete
              ? group.instance.completed_by ?? "self"
              : null,
          },
        };
      })
    );
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Operations
          </p>
          <h1 className="text-xl font-bold text-white">
            {readOnly ? "Checklists" : "Today's Checklists"}
          </h1>
          <p className="mt-0.5 text-xs text-white/50">
            Viewing{" "}
            <span className="text-white/70">{formatReadableDate(date)}</span>
          </p>
        </div>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => handleDateChange(e.target.value)}
          className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30"
        />
      </header>

      {canManage && (
        <div className="flex gap-2 text-xs">
          <Link
            href="/checklists/templates"
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-1 px-3 py-1.5 text-white/70 hover:bg-white/5"
          >
            <Settings2 size={14} strokeWidth={1.5} />
            Manage templates
          </Link>
          <Link
            href="/checklists/history"
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-1 px-3 py-1.5 text-white/70 hover:bg-white/5"
          >
            <History size={14} strokeWidth={1.5} />
            View history
          </Link>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading && (
        <div className="space-y-3">
          <div className="h-32 animate-shimmer rounded-2xl bg-surface-1" />
          <div
            className="h-32 animate-shimmer rounded-2xl bg-surface-1"
            style={{ animationDelay: "0.15s" }}
          />
        </div>
      )}

      {!loading && checklists.length === 0 && (
        <EmptyState
          icon={ClipboardCheck}
          title="No checklists set up yet"
          description={
            canManage
              ? "Create a template to get started."
              : "Ask a manager to create one."
          }
          actionLabel={canManage ? "Create template" : undefined}
          actionHref={canManage ? "/checklists/templates/new" : undefined}
        />
      )}

      {!loading &&
        checklists.map((group) => (
          <ChecklistCard
            key={group.instance.id}
            group={group}
            readOnly={readOnly}
            categoryLabel={CATEGORY_LABEL[group.template.category] ?? "Daily"}
            onToggled={handleItemToggle}
            onServerError={(err) => setError(err)}
            onServerSuccess={() => router.refresh()}
          />
        ))}
    </div>
  );
}

interface ChecklistCardProps {
  group: ChecklistInstanceWithItems;
  readOnly: boolean;
  categoryLabel: string;
  onToggled: (itemId: string, instanceId: string) => void;
  onServerError: (err: string) => void;
  onServerSuccess: () => void;
}

function ChecklistCard({
  group,
  readOnly,
  categoryLabel,
  onToggled,
  onServerError,
  onServerSuccess,
}: ChecklistCardProps) {
  const total = group.items.length;
  const done = useMemo(
    () => group.items.filter((i) => i.checked).length,
    [group.items]
  );
  const completed = group.instance.completed_at !== null && done === total;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <article className="space-y-3 rounded-2xl border border-white/10 bg-surface-1 p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white">
              {group.template.name}
            </h2>
            <span className="rounded-full border border-white/10 bg-surface-2 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/50">
              {categoryLabel}
            </span>
          </div>
          {group.template.description && (
            <p className="mt-1 text-xs text-white/50">
              {group.template.description}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-medium text-white/70">
            {done}/{total}
          </p>
          <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${
                completed ? "bg-emerald-400" : "bg-accent"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </header>

      {completed && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 size={16} strokeWidth={1.5} />
          <span>
            Completed
            {group.completed_by_name ? ` by ${group.completed_by_name}` : ""}
            {group.instance.completed_at
              ? ` at ${formatTime(group.instance.completed_at)}`
              : ""}
          </span>
        </div>
      )}

      <ul className="space-y-1.5">
        {group.items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            readOnly={readOnly}
            onToggled={() => onToggled(item.id, group.instance.id)}
            onServerError={onServerError}
            onServerSuccess={onServerSuccess}
          />
        ))}
      </ul>
    </article>
  );
}

interface ChecklistItemRowProps {
  item: ChecklistInstanceItem;
  readOnly: boolean;
  onToggled: () => void;
  onServerError: (err: string) => void;
  onServerSuccess: () => void;
}

function ChecklistItemRow({
  item,
  readOnly,
  onToggled,
  onServerError,
  onServerSuccess,
}: ChecklistItemRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (readOnly) return;
    // Optimistic update first so the UI responds instantly.
    onToggled();
    startTransition(async () => {
      const res = await toggleChecklistItemAction(item.id);
      if (!res.success) {
        // Roll the optimistic toggle back.
        onToggled();
        onServerError(res.error ?? "Failed to update item");
      } else {
        onServerSuccess();
      }
    });
  };

  return (
    <li className="rounded-lg border border-white/5 bg-surface-2/40">
      <div className="flex items-center gap-3 p-2.5">
        <button
          type="button"
          onClick={handleClick}
          disabled={readOnly || pending}
          aria-pressed={item.checked}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all ${
            item.checked
              ? "border-accent bg-accent text-white"
              : "border-white/20 bg-transparent hover:border-white/40"
          } ${readOnly ? "cursor-not-allowed opacity-70" : "cursor-pointer"} ${
            pending ? "opacity-60" : ""
          }`}
        >
          {item.checked && <CheckCircle2 size={14} strokeWidth={2} />}
        </button>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => item.description && setExpanded((v) => !v)}
            className={`flex w-full items-center justify-between gap-2 text-left ${
              item.description
                ? "cursor-pointer"
                : "cursor-default"
            }`}
          >
            <span
              className={`text-sm ${
                item.checked ? "text-white/50 line-through" : "text-white"
              }`}
            >
              {item.label}
            </span>
            {item.description && (
              <span className="shrink-0 text-white/40">
                {expanded ? (
                  <ChevronDown size={14} strokeWidth={1.5} />
                ) : (
                  <ChevronRight size={14} strokeWidth={1.5} />
                )}
              </span>
            )}
          </button>
          {item.checked && item.checked_at && (
            <p className="mt-0.5 text-[10px] text-white/40">
              {item.checked_by === "self"
                ? `Just now`
                : `Done at ${formatTime(item.checked_at)}`}
            </p>
          )}
        </div>
      </div>
      {expanded && item.description && (
        <p className="border-t border-white/5 px-9 py-2 text-xs text-white/60">
          {item.description}
        </p>
      )}
    </li>
  );
}

function formatReadableDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
