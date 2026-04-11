"use client";

// =============================================================================
// RateCardEditor
// =============================================================================
// Client-side CRUD editor for the owner /rates page. Each rate row is
// read-only until the owner taps Edit; Delete and Toggle active are exposed
// as separate buttons. An "Add rate" form sits at the bottom.
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createRateCardAction,
  deleteRateCardAction,
  toggleRateCardAction,
  updateRateCardAction,
} from "@/app/actions/settings";
import { formatSGDCents } from "@/lib/format";
import type { RateCardEntry, RateType } from "@/lib/types";

export interface RateCardEditorProps {
  rates: RateCardEntry[];
}

const RATE_TYPE_LABELS: Record<RateType, string> = {
  hourly: "Hourly",
  per_person: "Per person",
  per_game: "Per game",
};

export function RateCardEditor({ rates }: RateCardEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-3">
      {rates.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-white/50">
          No rate card entries yet.
        </p>
      )}

      {rates.map((rate) => (
        <div
          key={rate.id}
          className="rounded-xl border border-white/10 bg-black/20 p-4"
        >
          {editingId === rate.id ? (
            <RateForm
              rate={rate}
              onCancel={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ) : (
            <RateReadRow
              rate={rate}
              onEdit={() => setEditingId(rate.id)}
            />
          )}
        </div>
      ))}

      {adding ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <RateForm
            onCancel={() => setAdding(false)}
            onSaved={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-white/15 py-3 text-xs font-medium text-white/60 hover:bg-white/5"
        >
          + Add rate
        </button>
      )}
    </div>
  );
}

function RateReadRow({
  rate,
  onEdit,
}: {
  rate: RateCardEntry;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleToggle = () => {
    setError(null);
    startTransition(async () => {
      const res = await toggleRateCardAction(rate.id, !rate.is_active);
      if (!res.success) {
        setError(res.error ?? "Failed to toggle");
        return;
      }
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${rate.label}"? This cannot be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteRateCardAction(rate.id);
      if (!res.success) {
        setError(res.error ?? "Failed to delete");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-white">{rate.label}</p>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60">
              {RATE_TYPE_LABELS[rate.rate_type]}
            </span>
            {!rate.is_active && (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-red-300">
                Inactive
              </span>
            )}
          </div>
          <p className="mt-1 text-xl font-bold text-white">
            {formatSGDCents(rate.amount_cents)}
          </p>
          {rate.description && (
            <p className="mt-1 text-xs text-white/50">{rate.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-md border border-white/10 px-3 py-1 text-[11px] text-white/80 hover:bg-white/5"
        >
          Edit
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          className="flex-1 rounded-md border border-white/10 px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/5 disabled:opacity-50"
        >
          {rate.is_active ? "Deactivate" : "Activate"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="flex-1 rounded-md border border-red-500/30 px-3 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
        >
          Delete
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

interface RateFormProps {
  rate?: RateCardEntry;
  onCancel: () => void;
  onSaved: () => void;
}

function RateForm({ rate, onCancel, onSaved }: RateFormProps) {
  const router = useRouter();
  const [label, setLabel] = useState(rate?.label ?? "");
  const [rateType, setRateType] = useState<RateType>(
    rate?.rate_type ?? "hourly"
  );
  const [amountDollars, setAmountDollars] = useState(
    rate ? (rate.amount_cents / 100).toFixed(2) : ""
  );
  const [description, setDescription] = useState(rate?.description ?? "");

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountCents = Math.round(parseFloat(amountDollars || "0") * 100);
    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setError("Amount must be non-negative");
      return;
    }

    startTransition(async () => {
      if (rate) {
        // Edit: rate_type is immutable here — only label/amount/description.
        const res = await updateRateCardAction(rate.id, {
          label: label.trim(),
          amount_cents: amountCents,
          description: description.trim() || null,
        });
        if (!res.success) {
          setError(res.error ?? "Failed to save");
          return;
        }
      } else {
        const res = await createRateCardAction({
          rate_type: rateType,
          label: label.trim(),
          amount_cents: amountCents,
          description: description.trim() || null,
        });
        if (!res.success) {
          setError(res.error ?? "Failed to save");
          return;
        }
      }
      router.refresh();
      onSaved();
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <Field label="Label">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        />
      </Field>

      {!rate && (
        <Field label="Type">
          <select
            value={rateType}
            onChange={(e) => setRateType(e.target.value as RateType)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          >
            <option value="hourly">Hourly</option>
            <option value="per_person">Per person</option>
            <option value="per_game">Per game</option>
          </select>
        </Field>
      )}

      <Field label="Amount (SGD)">
        <input
          type="number"
          step="0.01"
          min="0"
          value={amountDollars}
          onChange={(e) => setAmountDollars(e.target.value)}
          required
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        />
      </Field>

      <Field label="Description (optional)">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        />
      </Field>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="flex-1 rounded-md border border-white/15 px-3 py-2 text-xs text-white/70 hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}
