"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  attestRunForReviewAction,
  deleteDraftRunAction,
  lockRunAction,
  recomputeRunAction,
  unattestRunAction,
  unlockRunAction,
} from "@/scheduling/payroll/actions/runs";
import {
  addLineItemAction,
  deleteLineItemAction,
} from "@/scheduling/payroll/actions/line-items";
import { exportRunCsvAction } from "@/scheduling/payroll/actions/export";
import type {
  PayrollLineItem,
  PayrollLineItemKind,
  PayrollRun,
} from "@/scheduling/payroll/types";

const MANUAL_KINDS: PayrollLineItemKind[] = [
  "allowance",
  "tip",
  "bonus",
  "deduction",
  "other",
];

interface Props {
  run: PayrollRun;
  lineItems: PayrollLineItem[];
  staff: Array<{ id: string; full_name: string }>;
  isOwner: boolean;
}

function formatTs(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function PayrollRunClient({ run, lineItems, staff, isOwner }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [unlockNote, setUnlockNote] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);

  const staffMap = useMemo(
    () => new Map(staff.map((s) => [s.id, s.full_name])),
    [staff]
  );

  const lockerName = run.locked_by ? staffMap.get(run.locked_by) ?? null : null;
  const unlockerName = run.unlocked_by
    ? staffMap.get(run.unlocked_by) ?? null
    : null;

  const grouped = useMemo(() => {
    const out = new Map<string, PayrollLineItem[]>();
    for (const item of lineItems) {
      const list = out.get(item.staff_id) ?? [];
      list.push(item);
      out.set(item.staff_id, list);
    }
    return out;
  }, [lineItems]);

  const totals = useMemo(() => {
    const gross = lineItems.reduce(
      (s, i) => s + (i.amount > 0 ? i.amount : 0),
      0
    );
    const net = lineItems.reduce((s, i) => s + i.amount, 0);
    return { gross, net };
  }, [lineItems]);

  const isDraft = run.status === "draft";
  const isReview = run.status === "review";
  const isLocked = run.status === "locked";

  function run_<T>(p: () => Promise<T>) {
    setError(null);
    start(async () => {
      try {
        await p();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/manager/payroll"
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            ← All runs
          </Link>
          <h1 className="text-xl font-semibold text-white">
            Payroll: {run.period_start} – {run.period_end}
          </h1>
          <p className="text-sm text-zinc-400">
            Payment {run.payment_date} · Status{" "}
            <span
              className={
                isDraft
                  ? "text-amber-300"
                  : isReview
                  ? "text-sky-300"
                  : "text-emerald-300"
              }
            >
              {run.status}
            </span>
            {run.last_computed_at && (
              <span className="ml-2 text-zinc-500">
                · Last computed {new Date(run.last_computed_at).toLocaleString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run_(async () => {
                    const r = await recomputeRunAction(run.id);
                    if (!r.success) throw new Error(r.error);
                  })
                }
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
              >
                Recompute
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run_(async () => {
                    const r = await attestRunForReviewAction(run.id);
                    if (!r.success) throw new Error(r.error);
                  })
                }
                className="rounded bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
              >
                Attest for review
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run_(async () => {
                    if (!confirm("Delete this draft run?")) return;
                    const r = await deleteDraftRunAction(run.id);
                    if (!r.success) throw new Error(r.error);
                    router.push("/manager/payroll");
                  })
                }
                className="rounded bg-rose-900/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-900/60"
              >
                Delete draft
              </button>
            </>
          )}
          {isReview && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run_(async () => {
                    const r = await unattestRunAction(run.id);
                    if (!r.success) throw new Error(r.error);
                  })
                }
                className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
              >
                Back to draft
              </button>
              {isOwner && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run_(async () => {
                      const r = await lockRunAction(run.id);
                      if (!r.success) throw new Error(r.error);
                    })
                  }
                  className="rounded bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-400"
                >
                  Lock
                </button>
              )}
            </>
          )}
          {isLocked && isOwner && (
            <button
              type="button"
              onClick={() => setShowUnlock(true)}
              className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-amber-400"
            >
              Unlock…
            </button>
          )}
          {!isDraft && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run_(async () => {
                  const r = await exportRunCsvAction(run.id);
                  if (!r.success || !r.csv || !r.filename) {
                    throw new Error(r.error ?? "Export failed");
                  }
                  downloadCsv(r.filename, r.csv);
                })
              }
              className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {showUnlock && isOwner && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="mb-2 text-sm text-amber-100">
            Unlocking requires a note describing why.
          </p>
          <textarea
            value={unlockNote}
            onChange={(e) => setUnlockNote(e.target.value)}
            placeholder="Why are we unlocking?"
            className="mb-2 w-full rounded border border-amber-500/50 bg-zinc-950 px-2 py-1 text-sm text-amber-100"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowUnlock(false)}
              className="rounded bg-zinc-800 px-3 py-1 text-xs text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !unlockNote.trim()}
              onClick={() =>
                run_(async () => {
                  const r = await unlockRunAction({
                    runId: run.id,
                    note: unlockNote,
                  });
                  if (!r.success) throw new Error(r.error);
                  setShowUnlock(false);
                  setUnlockNote("");
                })
              }
              className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-amber-400 disabled:opacity-60"
            >
              Unlock with note
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex justify-between text-sm text-zinc-300">
          <div>
            <p className="text-zinc-500">Gross</p>
            <p className="text-lg text-zinc-100">{fmt(totals.gross)}</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-500">Net</p>
            <p className="text-lg text-zinc-100">{fmt(totals.net)}</p>
          </div>
        </div>
      </div>

      {(run.locked_by || run.unlocked_by) && (
        <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-400">
          {run.locked_by && (
            <p>
              Locked by{" "}
              <span className="text-zinc-200">
                {lockerName ?? run.locked_by}
              </span>{" "}
              on {formatTs(run.locked_at)}
            </p>
          )}
          {isReview && run.unlocked_by && (
            <p>
              Last unlocked by{" "}
              <span className="text-zinc-200">
                {unlockerName ?? run.unlocked_by}
              </span>{" "}
              on {formatTs(run.unlocked_at)}
              {run.unlock_note && (
                <>
                  {" "}
                  — note:{" "}
                  <span className="italic text-zinc-300">
                    &ldquo;{run.unlock_note}&rdquo;
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {Array.from(grouped.entries()).map(([staffId, items]) => (
          <StaffSection
            key={staffId}
            staffId={staffId}
            staffName={staffMap.get(staffId) ?? staffId}
            items={items}
            isDraft={isDraft}
            runId={run.id}
            onAfter={() => router.refresh()}
          />
        ))}
        {grouped.size === 0 && (
          <p className="rounded border border-zinc-800 bg-zinc-900/40 p-6 text-center text-sm text-zinc-400">
            No engine line items yet. Recompute the run to populate.
          </p>
        )}
      </div>
    </div>
  );
}

interface StaffSectionProps {
  staffId: string;
  staffName: string;
  items: PayrollLineItem[];
  isDraft: boolean;
  runId: string;
  onAfter: () => void;
}

function StaffSection({
  staffId,
  staffName,
  items,
  isDraft,
  runId,
  onAfter,
}: StaffSectionProps) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<PayrollLineItemKind>("allowance");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const engine = items.filter((i) => i.source === "engine");
  const manual = items.filter((i) => i.source === "manual");
  const subtotal = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium text-zinc-100">{staffName}</h3>
        <span className="text-sm text-zinc-300">{fmt(subtotal)}</span>
      </div>

      {engine.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs uppercase text-zinc-500">Engine items</p>
          <table className="w-full text-sm">
            <tbody>
              {engine.map((i) => (
                <tr key={i.id} className="border-t border-zinc-800">
                  <td className="py-1.5 text-zinc-200">{i.label}</td>
                  <td className="py-1.5 text-zinc-400">
                    {i.hours !== null ? `${fmt(i.hours)}h` : ""}
                  </td>
                  <td className="py-1.5 text-zinc-400">
                    {i.rate_applied !== null ? `@ ${fmt(i.rate_applied)}` : ""}
                  </td>
                  <td className="py-1.5 text-right text-zinc-200">
                    {fmt(i.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {manual.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs uppercase text-zinc-500">Manual items</p>
          <table className="w-full text-sm">
            <tbody>
              {manual.map((i) => (
                <tr key={i.id} className="border-t border-zinc-800">
                  <td className="py-1.5 text-zinc-200">{i.label}</td>
                  <td className="py-1.5 text-zinc-500">{i.kind}</td>
                  <td className="py-1.5 text-right text-zinc-200">
                    {fmt(i.amount)}
                  </td>
                  <td className="py-1.5 text-right">
                    {isDraft && (
                      <button
                        type="button"
                        disabled={pending}
                        className="text-xs text-rose-300 hover:underline"
                        onClick={() =>
                          start(async () => {
                            const r = await deleteLineItemAction(i.id);
                            if (!r.success) {
                              setError(r.error ?? "Delete failed");
                              return;
                            }
                            onAfter();
                          })
                        }
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isDraft && (
        <div className="mt-3 border-t border-zinc-800 pt-2">
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-xs text-rose-400 hover:underline"
            >
              + Add line item
            </button>
          ) : (
            <div className="space-y-2 rounded bg-zinc-950/40 p-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as PayrollLineItemKind)
                  }
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                >
                  {MANUAL_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount"
                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
                />
              </div>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label"
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
              />
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-100"
              />
              {error && <p className="text-xs text-rose-300">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={pending || !label.trim() || !amount.trim()}
                  onClick={() =>
                    start(async () => {
                      const r = await addLineItemAction({
                        runId,
                        staffId,
                        kind,
                        label,
                        amount: Number(amount),
                        notes: notes || null,
                      });
                      if (!r.success) {
                        setError(r.error ?? "Add failed");
                        return;
                      }
                      setAdding(false);
                      setLabel("");
                      setAmount("");
                      setNotes("");
                      setError(null);
                      onAfter();
                    })
                  }
                  className="rounded bg-rose-500 px-2 py-1 text-xs font-medium text-white hover:bg-rose-400 disabled:opacity-60"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
