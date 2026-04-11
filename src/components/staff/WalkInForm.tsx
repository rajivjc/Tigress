"use client";

// =============================================================================
// WalkInForm
// =============================================================================
// Staff-facing form for entering a non-member reservation. Mirrors the member
// booking flow's mental model: pick table → date → start time → duration →
// guest details → submit. Posts to createWalkInAction.
// =============================================================================

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createWalkInAction } from "@/app/actions/walk-in";
import { getAvailableSlotsAction } from "@/app/actions/bookings";
import { addDaysSGT, dateAtHourSGT, todaySGT } from "@/lib/timezone";
import { formatTime } from "@/lib/format";
import type { TimeSlot } from "@/lib/data/tables";

export interface WalkInFormProps {
  tables: { id: string; table_number: number }[];
  /** Table id pre-filled from `?table=` query param. */
  initialTableId?: string;
}

const DURATIONS: { hours: 1 | 2 | 3; label: string }[] = [
  { hours: 1, label: "1 hr" },
  { hours: 2, label: "2 hr" },
  { hours: 3, label: "3 hr" },
];

const HOURS = Array.from({ length: 14 }, (_, i) => 10 + i); // 10-23

export function WalkInForm({ tables, initialTableId }: WalkInFormProps) {
  const router = useRouter();

  const today = todaySGT();
  const maxDate = addDaysSGT(today, 14);

  const [tableId, setTableId] = useState<string>(
    initialTableId ?? tables[0]?.id ?? ""
  );
  const [date, setDate] = useState<string>(today);
  const [startHour, setStartHour] = useState<number>(currentRoundedHour());
  const [duration, setDuration] = useState<1 | 2 | 3>(1);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [comments, setComments] = useState("");
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositPaid, setDepositPaid] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [slots, setSlots] = useState<TimeSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Fetch available slots whenever table + date changes so staff can see
  // existing bookings/blocks before picking a start time.
  useEffect(() => {
    if (!tableId || !date) {
      setSlots(null);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    getAvailableSlotsAction(tableId, date).then((res) => {
      if (cancelled) return;
      setSlots(res.slots ?? null);
      setSlotsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [tableId, date]);

  const unavailableSlots = (slots ?? []).filter(
    (s) => !s.available && s.reason !== "Past"
  );

  // Merge consecutive unavailable slots with the same reason into ranges so
  // the summary reads as "Booked: 19:00 – 21:00" instead of one line per hour.
  const unavailableRanges: Array<{
    reason: string;
    startIso: string;
    endIso: string;
  }> = [];
  for (const slot of unavailableSlots) {
    const last = unavailableRanges[unavailableRanges.length - 1];
    if (
      last &&
      last.reason === (slot.reason ?? "Unavailable") &&
      last.endIso === slot.starts_at
    ) {
      last.endIso = slot.ends_at;
    } else {
      unavailableRanges.push({
        reason: slot.reason ?? "Unavailable",
        startIso: slot.starts_at,
        endIso: slot.ends_at,
      });
    }
  }

  const selectedStartIso = dateAtHourSGT(date, startHour).toISOString();
  const selectedEndIso = dateAtHourSGT(date, startHour + duration).toISOString();
  const selectedConflicts = unavailableSlots.some(
    (s) =>
      // overlap check: [startIso,endIso) vs [s.starts_at,s.ends_at)
      s.starts_at < selectedEndIso && s.ends_at > selectedStartIso
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const startsAt = dateAtHourSGT(date, startHour).toISOString();
    const endsAt = dateAtHourSGT(date, startHour + duration).toISOString();

    startTransition(async () => {
      const res = await createWalkInAction({
        table_id: tableId,
        starts_at: startsAt,
        ends_at: endsAt,
        guest_name: guestName,
        guest_phone: guestPhone || null,
        guest_count: guestCount,
        comments: comments || null,
        deposit_required: depositRequired,
        deposit_paid: depositRequired && depositPaid,
      });
      if (!res.success) {
        setSubmitError(res.error ?? "Failed to create walk-in");
        return;
      }
      router.push("/floor");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Walk-in
        </p>
        <h1 className="text-xl font-bold text-white">Seat a guest</h1>
      </header>

      <Section label="Table">
        <select
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
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
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          required
        />
      </Section>

      <Section label="Start time">
        <select
          value={startHour}
          onChange={(e) => setStartHour(Number(e.target.value))}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        >
          {HOURS.map((h) => {
            const slotStart = dateAtHourSGT(date, h).toISOString();
            const match = slots?.find((s) => s.starts_at === slotStart);
            const busy = match && !match.available && match.reason !== "Past";
            return (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
                {busy ? ` — ${match?.reason ?? "Unavailable"}` : ""}
              </option>
            );
          })}
        </select>

        {/* Availability summary so staff can eyeball conflicts without
            submitting the form first. */}
        <div className="mt-2 rounded-md border border-white/10 bg-surface-1/80 p-2 text-[11px] text-white/60">
          {slotsLoading && "Checking availability…"}
          {!slotsLoading && slots && unavailableRanges.length === 0 && (
            <span className="text-emerald-300/80">
              No conflicts on this table today.
            </span>
          )}
          {!slotsLoading && unavailableRanges.length > 0 && (
            <ul className="space-y-0.5">
              {unavailableRanges.map((r, idx) => (
                <li key={idx}>
                  <span
                    className={
                      r.reason === "Blocked"
                        ? "text-amber-300/90"
                        : "text-red-300/90"
                    }
                  >
                    {r.reason}:
                  </span>{" "}
                  <span className="text-white/70">
                    {formatTime(r.startIso)} – {formatTime(r.endIso)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedConflicts && !slotsLoading && (
          <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
            Your selected window overlaps an existing booking or block.
          </p>
        )}
      </Section>

      <Section label="Duration">
        <div className="flex gap-2">
          {DURATIONS.map((d) => {
            const active = duration === d.hours;
            return (
              <button
                key={d.hours}
                type="button"
                onClick={() => setDuration(d.hours)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
                  active
                    ? "border-accent bg-accent/15 text-white"
                    : "border-white/10 text-white/70 hover:bg-white/5"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Guest name">
        <input
          type="text"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          required
          maxLength={100}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          placeholder="Jane Doe"
        />
      </Section>

      <Section label="Guest phone (optional)">
        <input
          type="tel"
          value={guestPhone}
          onChange={(e) => setGuestPhone(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          placeholder="+65 9123 4567"
        />
      </Section>

      <Section label="Number of guests">
        <input
          type="number"
          min={1}
          max={20}
          value={guestCount}
          onChange={(e) =>
            setGuestCount(Math.max(1, Number(e.target.value) || 1))
          }
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Section>

      <Section label="Comments (optional)">
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none ring-0 transition-colors duration-200 focus:ring-2 focus:ring-accent/30 focus:border-accent"
          placeholder="Birthday party, prefers low table…"
        />
      </Section>

      <Section label="Deposit">
        <div className="space-y-2">
          <Toggle
            label="Deposit required?"
            checked={depositRequired}
            onChange={(v) => {
              setDepositRequired(v);
              if (!v) setDepositPaid(false);
            }}
          />
          {depositRequired && (
            <Toggle
              label="Deposit paid?"
              checked={depositPaid}
              onChange={setDepositPaid}
            />
          )}
        </div>
      </Section>

      {submitError && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !tableId || !guestName.trim()}
        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
      >
        {pending ? "Creating…" : "Create walk-in"}
      </button>
    </form>
  );
}

// ---------- Sub-components ----------

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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between rounded-md border border-white/10 bg-surface-1/80 px-3 py-2 text-sm text-white/80">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-accent"
      />
    </label>
  );
}

// ---------- Helpers ----------

function currentRoundedHour(): number {
  // Default to the upcoming hour in venue time. Browser local time is fine
  // here since the user is on-site in Singapore — and the SGT helpers will
  // re-anchor the date when we build the ISO timestamp.
  const h = new Date().getHours() + 1;
  if (h < 10) return 10;
  if (h > 23) return 23;
  return h;
}
