"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  removeHolidayAction,
  upsertHolidayAction,
} from "@/scheduling/payroll/actions/configuration";
import type { PayrollHoliday } from "@/scheduling/payroll/types";

interface Props {
  holidays: PayrollHoliday[];
}

export function PayrollHolidaysEditor({ holidays }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const years = useMemo(() => {
    const ys = new Set<number>();
    for (const h of holidays) ys.add(Number(h.date.slice(0, 4)));
    if (ys.size === 0) ys.add(new Date().getFullYear());
    return Array.from(ys).sort((a, b) => b - a);
  }, [holidays]);
  const [year, setYear] = useState(years[0]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const filtered = useMemo(
    () =>
      holidays
        .filter((h) => h.date.startsWith(`${year}-`))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [holidays, year]
  );

  function add() {
    setError(null);
    start(async () => {
      const r = await upsertHolidayAction({ date, name, isActive: true });
      if (!r.success) {
        setError(r.error ?? "Add failed");
        return;
      }
      setDate("");
      setName("");
      router.refresh();
    });
  }

  function toggle(h: PayrollHoliday) {
    setError(null);
    start(async () => {
      const r = await upsertHolidayAction({
        date: h.date,
        name: h.name,
        isActive: !h.is_active,
      });
      if (!r.success) {
        setError(r.error ?? "Update failed");
        return;
      }
      router.refresh();
    });
  }

  function remove(h: PayrollHoliday) {
    if (!confirm(`Remove ${h.date} (${h.name})?`)) return;
    setError(null);
    start(async () => {
      const r = await removeHolidayAction(h.date);
      if (!r.success) {
        setError(r.error ?? "Remove failed");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded border border-rose-700 bg-rose-900/30 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <label className="text-xs uppercase text-zinc-500">Year</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1 text-sm text-zinc-100"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <ul className="space-y-1">
        {filtered.length === 0 && (
          <li className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-500">
            No holidays for {year}.
          </li>
        )}
        {filtered.map((h) => (
          <li
            key={h.date}
            className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-sm"
          >
            <span>
              <span className="font-medium text-zinc-100">{h.date}</span>{" "}
              <span className="text-zinc-300">— {h.name}</span>
              {!h.is_active && (
                <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                  inactive
                </span>
              )}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => toggle(h)}
                className="text-xs text-zinc-300 hover:underline"
              >
                {h.is_active ? "Deactivate" : "Reactivate"}
              </button>
              <button
                type="button"
                onClick={() => remove(h)}
                className="text-xs text-rose-300 hover:underline"
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <p className="mb-2 text-xs uppercase text-zinc-500">Add holiday</p>
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
          />
          <input
            type="text"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100"
          />
          <button
            type="button"
            disabled={pending || !date || !name.trim()}
            onClick={add}
            className="rounded bg-rose-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-400 disabled:opacity-60"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
