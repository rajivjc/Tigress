"use client";

// =============================================================================
// BlockForm
// =============================================================================
// Manager/owner form for blocking a table for a specified window. Used to
// reserve tables for private events, maintenance, etc. Posts to
// createBlockAction.
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBlockAction } from "@/app/actions/block";
import { addDaysSGT, dateAtHourSGT, todaySGT } from "@/lib/timezone";

export interface BlockFormProps {
  tables: { id: string; table_number: number }[];
  initialTableId?: string;
}

const HOURS = Array.from({ length: 14 }, (_, i) => 10 + i); // 10-23

export function BlockForm({ tables, initialTableId }: BlockFormProps) {
  const router = useRouter();
  const today = todaySGT();
  const maxDate = addDaysSGT(today, 60);

  const [tableId, setTableId] = useState<string>(
    initialTableId ?? tables[0]?.id ?? ""
  );
  const [date, setDate] = useState<string>(today);
  const [startHour, setStartHour] = useState<number>(10);
  const [endHour, setEndHour] = useState<number>(12);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (endHour <= startHour) {
      setSubmitError("End time must be after start time");
      return;
    }

    const startsAt = dateAtHourSGT(date, startHour).toISOString();
    const endsAt = dateAtHourSGT(date, endHour).toISOString();

    startTransition(async () => {
      const res = await createBlockAction({
        table_id: tableId,
        starts_at: startsAt,
        ends_at: endsAt,
        reason: reason.trim(),
        notes: notes.trim() || null,
      });
      if (!res.success) {
        setSubmitError(res.error ?? "Failed to block table");
        return;
      }
      router.push("/floor");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Block slot
        </p>
        <h1 className="text-xl font-bold text-white">Reserve a table</h1>
        <p className="mt-1 text-xs text-white/50">
          Use this to take a table off the floor for maintenance, a private
          event, or staff training.
        </p>
      </header>

      <Section label="Table">
        <select
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          required
        >
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              Table {t.table_number}
            </option>
          ))}
        </select>
      </Section>

      <Section label="Date">
        <input
          type="date"
          value={date}
          min={today}
          max={maxDate}
          onChange={(e) => setDate(e.target.value || today)}
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          required
        />
      </Section>

      <div className="grid grid-cols-2 gap-3">
        <Section label="Start time">
          <select
            value={startHour}
            onChange={(e) => setStartHour(Number(e.target.value))}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Section>

        <Section label="End time">
          <select
            value={endHour}
            onChange={(e) => setEndHour(Number(e.target.value))}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
          >
            {HOURS.filter((h) => h > startHour).concat(24).map((h) => (
              <option key={h} value={h}>
                {String(h % 24).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Section>
      </div>

      <Section label="Reason">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          maxLength={120}
          placeholder="Maintenance"
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        />
      </Section>

      <Section label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Felt re-covering, new cushions, etc."
          className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
        />
      </Section>

      {submitError && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !tableId || !reason.trim()}
        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Blocking…" : "Block table"}
      </button>
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
