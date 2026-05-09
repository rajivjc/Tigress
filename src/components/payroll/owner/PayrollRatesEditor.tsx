"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  endStaffRateAction,
  setStaffRateAction,
} from "@/scheduling/payroll/actions/configuration";
import type { PayrollRate } from "@/scheduling/payroll/types";

interface Props {
  staff: Array<{ id: string; full_name: string }>;
  rates: PayrollRate[];
}

export function PayrollRatesEditor({ staff, rates }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);

  const ratesByStaff = useMemo(() => {
    const out = new Map<string, PayrollRate[]>();
    for (const r of rates) {
      const list = out.get(r.staff_id) ?? [];
      list.push(r);
      out.set(r.staff_id, list);
    }
    for (const list of out.values()) {
      list.sort((a, b) => b.effective_from.localeCompare(a.effective_from));
    }
    return out;
  }, [rates]);

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {staff.map((s) => {
        const list = ratesByStaff.get(s.id) ?? [];
        const open = list.find((r) => r.effective_until === null);
        const isExpanded = openStaffId === s.id;
        return (
          <div
            key={s.id}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-zinc-100">{s.full_name}</p>
                <p className="text-xs text-zinc-500">
                  Current rate:{" "}
                  {open
                    ? `${open.hourly_rate.toFixed(2)} (since ${open.effective_from})`
                    : "no open rate"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenStaffId(isExpanded ? null : s.id)}
                className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                {isExpanded ? "Close" : "Edit"}
              </button>
            </div>
            {isExpanded && (
              <div className="mt-3 space-y-3 border-t border-zinc-800 pt-3">
                <SetRateForm
                  staffId={s.id}
                  pending={pending}
                  onSubmit={(hourlyRate, effectiveFrom) =>
                    start(async () => {
                      setError(null);
                      const r = await setStaffRateAction({
                        staffId: s.id,
                        hourlyRate,
                        effectiveFrom,
                      });
                      if (!r.success) {
                        setError(r.error ?? "Save failed");
                        return;
                      }
                      router.refresh();
                    })
                  }
                />
                {open && (
                  <EndRateForm
                    pending={pending}
                    onSubmit={(effectiveUntil) =>
                      start(async () => {
                        setError(null);
                        const r = await endStaffRateAction({
                          staffId: s.id,
                          effectiveUntil,
                        });
                        if (!r.success) {
                          setError(r.error ?? "End failed");
                          return;
                        }
                        router.refresh();
                      })
                    }
                  />
                )}
                {list.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs uppercase text-zinc-500">History</p>
                    <table className="w-full text-sm">
                      <thead className="text-xs text-zinc-500">
                        <tr>
                          <th className="text-left">From</th>
                          <th className="text-left">Until</th>
                          <th className="text-right">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((rate) => (
                          <tr key={rate.id} className="border-t border-zinc-800">
                            <td className="py-1 text-zinc-300">
                              {rate.effective_from}
                            </td>
                            <td className="py-1 text-zinc-400">
                              {rate.effective_until ?? "open"}
                            </td>
                            <td className="py-1 text-right text-zinc-200">
                              {rate.hourly_rate.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SetRateForm({
  pending,
  onSubmit,
}: {
  staffId: string;
  pending: boolean;
  onSubmit: (hourlyRate: number, effectiveFrom: string) => void;
}) {
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState("");
  const valid = rate && Number(rate) >= 0 && from;
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
      <p className="mb-2 text-xs uppercase text-zinc-500">Set new rate</p>
      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min={0}
          placeholder="Hourly rate"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          className={inputClass}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={inputClass}
        />
        <button
          type="button"
          disabled={pending || !valid}
          onClick={() => onSubmit(Number(rate), from)}
          className="rounded bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
        >
          Set
        </button>
      </div>
    </div>
  );
}

function EndRateForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (effectiveUntil: string) => void;
}) {
  const [until, setUntil] = useState("");
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
      <p className="mb-2 text-xs uppercase text-zinc-500">End current rate</p>
      <div className="flex gap-2">
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className={inputClass}
        />
        <button
          type="button"
          disabled={pending || !until}
          onClick={() => onSubmit(until)}
          className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-amber-400 disabled:opacity-60"
        >
          End
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100";
