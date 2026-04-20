"use client";

// =============================================================================
// ChecklistTemplateEditor
// =============================================================================
// Create/edit form for checklist templates. Uses simple up/down arrows for
// ordering rather than drag-and-drop — keeps it functional on mobile and
// avoids a heavy dep. Item list is sent as a full replacement, so the data
// layer sorts out which items are new / updated / deleted.
// =============================================================================

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createChecklistTemplateAction,
  updateChecklistTemplateAction,
  updateChecklistTemplateItemsAction,
} from "@/app/actions/checklists";
import type {
  ChecklistCategory,
  ChecklistTemplateWithItems,
} from "@/lib/types/checklists";

interface EditorItem {
  /** Existing items carry the DB id; new rows have a local-only id. */
  id?: string;
  /** Unique client-side key so React stays happy during reorder. */
  key: string;
  label: string;
  description: string;
}

export interface ChecklistTemplateEditorProps {
  mode: "create" | "edit";
  initial?: ChecklistTemplateWithItems;
}

const CATEGORIES: { value: ChecklistCategory; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "ad_hoc", label: "Ad-hoc" },
];

export function ChecklistTemplateEditor({
  mode,
  initial,
}: ChecklistTemplateEditorProps) {
  const router = useRouter();

  const [name, setName] = useState(initial?.template.name ?? "");
  const [description, setDescription] = useState(
    initial?.template.description ?? ""
  );
  const [category, setCategory] = useState<ChecklistCategory>(
    initial?.template.category ?? "daily"
  );
  const [items, setItems] = useState<EditorItem[]>(
    initial
      ? initial.items.map((i) => ({
          id: i.id,
          key: i.id,
          label: i.label,
          description: i.description ?? "",
        }))
      : [makeEmptyItem()]
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addItem = () => {
    setItems((prev) => [...prev, makeEmptyItem()]);
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const updateItem = (key: string, patch: Partial<EditorItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ...patch } : i))
    );
  };

  const moveItem = (key: string, delta: -1 | 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.key === key);
      if (idx < 0) return prev;
      const target = idx + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const cleanedItems = items.filter((i) => i.label.trim().length > 0);
    if (cleanedItems.length === 0) {
      setError("Add at least one item");
      return;
    }

    startTransition(async () => {
      if (mode === "create") {
        const res = await createChecklistTemplateAction({
          name,
          description: description.trim() || null,
          category,
          items: cleanedItems.map((i) => ({
            label: i.label,
            description: i.description.trim() || null,
          })),
        });
        if (!res.success) {
          setError(res.error ?? "Failed to create template");
          return;
        }
        router.push("/checklists/templates");
        router.refresh();
      } else if (initial) {
        const templateId = initial.template.id;
        const metaRes = await updateChecklistTemplateAction(templateId, {
          name,
          description: description.trim() || null,
          category,
        });
        if (!metaRes.success) {
          setError(metaRes.error ?? "Failed to update template");
          return;
        }
        const itemsRes = await updateChecklistTemplateItemsAction(
          templateId,
          cleanedItems.map((i, idx) => ({
            id: i.id,
            label: i.label,
            description: i.description.trim() || null,
            sort_order: idx + 1,
          }))
        );
        if (!itemsRes.success) {
          setError(itemsRes.error ?? "Failed to update items");
          return;
        }
        router.push("/checklists/templates");
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <header>
        <Link
          href="/checklists/templates"
          className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/40 hover:text-white/70"
        >
          <ArrowLeft size={12} strokeWidth={1.5} />
          Templates
        </Link>
        <h1 className="text-xl font-bold text-white">
          {mode === "create" ? "New template" : "Edit template"}
        </h1>
      </header>

      <Section label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="Opening Procedures"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Section>

      <Section label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Run through every morning before the venue opens."
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Section>

      <Section label="Category">
        <div className="flex gap-2">
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  active
                    ? "border-accent bg-accent/15 text-white"
                    : "border-white/10 text-white/70 hover:bg-white/5"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </Section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            Items
          </span>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-2 px-2.5 py-1 text-xs text-white/80 hover:bg-white/5"
          >
            <Plus size={12} strokeWidth={2} />
            Add item
          </button>
        </div>
        <ul className="space-y-2">
          {items.map((item, idx) => (
            <li
              key={item.key}
              className="space-y-2 rounded-xl border border-white/10 bg-surface-1 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => moveItem(item.key, -1)}
                    disabled={idx === 0}
                    className="rounded-md border border-white/10 bg-surface-2 p-1 text-white/60 hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp size={12} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(item.key, 1)}
                    disabled={idx === items.length - 1}
                    className="mt-1 rounded-md border border-white/10 bg-surface-2 p-1 text-white/60 hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown size={12} strokeWidth={2} />
                  </button>
                </div>
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) =>
                    updateItem(item.key, { label: e.target.value })
                  }
                  placeholder="Turn on all table lights"
                  maxLength={200}
                  className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  disabled={items.length === 1}
                  className="shrink-0 rounded-md border border-white/10 bg-surface-2 p-2 text-red-300/80 hover:bg-red-500/10 disabled:opacity-30"
                  aria-label="Remove item"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
              <textarea
                value={item.description}
                onChange={(e) =>
                  updateItem(item.key, { description: e.target.value })
                }
                rows={2}
                placeholder="Optional detail or SOP reference"
                className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-xs text-white/80 outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Link
          href="/checklists/templates"
          className="flex-1 rounded-lg border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white/70 hover:bg-white/5"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
        >
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create template"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}

function makeEmptyItem(): EditorItem {
  return {
    key: `new-${Math.random().toString(36).slice(2, 10)}`,
    label: "",
    description: "",
  };
}
