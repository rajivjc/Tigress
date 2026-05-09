"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRunAction } from "@/scheduling/payroll/actions/runs";

function firstOfThisMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function lastOfThisMonth(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

export function PayrollRunCreator() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [periodStart, setPeriodStart] = useState(firstOfThisMonth());
  const [periodEnd, setPeriodEnd] = useState(lastOfThisMonth());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-400"
      >
        New run
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <h3 className="mb-3 text-sm font-medium text-zinc-100">
        New payroll run
      </h3>
      <div className="space-y-2">
        <label className="block text-xs text-zinc-400">
          Period start
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Period end
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
          />
        </label>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await createRunAction({ periodStart, periodEnd });
                if (!r.success) {
                  setError(r.error ?? "Failed to create run");
                  return;
                }
                if (r.runId) router.push(`/manager/payroll/runs/${r.runId}`);
              });
            }}
            className="rounded bg-rose-500 px-3 py-1 text-xs text-white hover:bg-rose-400 disabled:opacity-60"
          >
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
