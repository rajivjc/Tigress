"use client";

// =============================================================================
// BookingFlow
// =============================================================================
// Single-page 3-step booking flow:
//   1. Select a table from the floorplan + pick a date
//   2. Pick a start time + duration
//   3. Confirm and create the booking
//
// State transitions are handled entirely in this client component — no route
// changes. On success we redirect to /bookings/[newId] so the member sees the
// confirmation.
// =============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FloorplanLayout } from "@/components/floorplan/FloorplanLayout";
import { TableDetailPanel } from "@/components/floorplan/TableDetailPanel";
import {
  createBookingAction,
  getAvailableSlotsAction,
} from "@/app/actions/bookings";
import { formatDateShort, formatTime } from "@/lib/format";
import type { TableWithStatus, TimeSlot } from "@/lib/data/tables";

interface BookingFlowProps {
  tables: TableWithStatus[];
  memberCreditsRemaining: number;
  priorityBookingDays: number;
  /** YYYY-MM-DD computed server-side so SSR matches client hydration. */
  initialDate: string;
  minDate: string;
  maxDate: string;
}

type Step = "select-table" | "pick-time" | "confirm";

type DurationHours = 1 | 2 | 3;

const DURATIONS: DurationHours[] = [1, 2, 3];

export function BookingFlow({
  tables,
  memberCreditsRemaining,
  priorityBookingDays: _priorityBookingDays,
  initialDate,
  minDate,
  maxDate,
}: BookingFlowProps) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("select-table");
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedTableId, setSelectedTableId] = useState<string | undefined>();
  const [peekedTableId, setPeekedTableId] = useState<string | undefined>();

  const [slots, setSlots] = useState<TimeSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(
    null
  );
  const [duration, setDuration] = useState<DurationHours>(1);

  const [submitting, startSubmit] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const peekedTable = peekedTableId
    ? tables.find((t) => t.id === peekedTableId) ?? null
    : null;
  const selectedTable = selectedTableId
    ? tables.find((t) => t.id === selectedTableId) ?? null
    : null;

  // ---------- Handlers ----------

  const handlePickTable = (tableId: string) => {
    setPeekedTableId(tableId);
  };

  const handleConfirmTableChoice = async (tableId: string) => {
    setSelectedTableId(tableId);
    setPeekedTableId(undefined);
    setSelectedSlotStart(null);
    setSubmitError(null);
    setStep("pick-time");
    await loadSlots(tableId, selectedDate);
  };

  const loadSlots = async (tableId: string, date: string) => {
    setSlotsLoading(true);
    setSlotsError(null);
    setSlots(null);
    const result = await getAvailableSlotsAction(tableId, date);
    if (result.error) {
      setSlotsError(result.error);
    } else {
      setSlots(result.slots ?? []);
    }
    setSlotsLoading(false);
  };

  const handleDateChangeOnFloor = async (date: string) => {
    setSelectedDate(date);
    setSelectedSlotStart(null);
    if (step === "pick-time" && selectedTableId) {
      await loadSlots(selectedTableId, date);
    }
  };

  const handleSubmit = () => {
    if (!selectedTableId || !selectedSlotStart) return;
    const startsAt = selectedSlotStart;
    const endsAt = new Date(
      Date.parse(selectedSlotStart) + duration * 60 * 60 * 1000
    ).toISOString();

    setSubmitError(null);
    startSubmit(async () => {
      const res = await createBookingAction({
        table_id: selectedTableId,
        starts_at: startsAt,
        ends_at: endsAt,
        credits_to_use: duration,
      });
      if (!res.success) {
        setSubmitError(res.error ?? "Failed to create booking");
        return;
      }
      if (res.bookingId) {
        router.push(`/bookings/${res.bookingId}`);
      }
    });
  };

  // ---------- Derived: valid start slots given current duration ----------

  const durationValidForStart = (startIso: string): boolean => {
    if (!slots) return false;
    const startIdx = slots.findIndex((s) => s.starts_at === startIso);
    if (startIdx === -1) return false;
    // All `duration` consecutive hourly slots must exist and be available.
    for (let i = 0; i < duration; i++) {
      const s = slots[startIdx + i];
      if (!s || !s.available) return false;
    }
    return true;
  };

  const creditsAfter = memberCreditsRemaining - duration;
  const insufficientCredits = memberCreditsRemaining < duration;

  // ---------- Render ----------

  return (
    <div className="space-y-4 p-4">
      <StepHeader step={step} onBack={() => handleBack(step, setStep)} />

      {step === "select-table" && (
        <>
          <DatePicker
            value={selectedDate}
            min={minDate}
            max={maxDate}
            onChange={handleDateChangeOnFloor}
          />

          <FloorplanLayout
            tables={tables}
            selectedTableId={peekedTableId}
            onSelectTable={handlePickTable}
          />

          <p className="px-1 text-center text-xs text-white/50">
            Tap any table to see details. Green tables are bookable now.
          </p>

          {peekedTable && (
            <TableDetailPanel
              table={peekedTable}
              userRole="member"
              onClose={() => setPeekedTableId(undefined)}
              onBook={handleConfirmTableChoice}
            />
          )}
        </>
      )}

      {step === "pick-time" && selectedTable && (
        <PickTimeStep
          table={selectedTable}
          date={selectedDate}
          slots={slots}
          loading={slotsLoading}
          error={slotsError}
          duration={duration}
          onDurationChange={setDuration}
          selectedSlotStart={selectedSlotStart}
          onSelectSlot={setSelectedSlotStart}
          durationValidForStart={durationValidForStart}
          memberCreditsRemaining={memberCreditsRemaining}
          insufficientCredits={insufficientCredits}
          onContinue={() => setStep("confirm")}
        />
      )}

      {step === "confirm" && selectedTable && selectedSlotStart && (
        <ConfirmStep
          table={selectedTable}
          startsAt={selectedSlotStart}
          duration={duration}
          creditsAfter={creditsAfter}
          submitting={submitting}
          error={submitError}
          onConfirm={handleSubmit}
          onBack={() => setStep("pick-time")}
        />
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function handleBack(step: Step, setStep: (s: Step) => void): void {
  if (step === "pick-time") setStep("select-table");
  else if (step === "confirm") setStep("pick-time");
}

function StepHeader({
  step,
  onBack,
}: {
  step: Step;
  onBack: () => void;
}) {
  const labels: Record<Step, string> = {
    "select-table": "Pick a table",
    "pick-time": "Pick a time",
    confirm: "Confirm",
  };
  const stepNum = step === "select-table" ? 1 : step === "pick-time" ? 2 : 3;
  return (
    <header className="flex items-center gap-3">
      {step !== "select-table" && (
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/5"
        >
          ← Back
        </button>
      )}
      <div>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Step {stepNum} of 3
        </p>
        <h1 className="text-lg font-bold text-white">{labels[step]}</h1>
      </div>
    </header>
  );
}

function DatePicker({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (d: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-1 p-3">
      <label className="flex-1">
        <span className="block text-[11px] uppercase tracking-wider text-white/40">
          Date
        </span>
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value || min)}
          className="mt-1 w-full bg-transparent text-sm font-medium text-white outline-none"
        />
      </label>
      <div className="rounded-md bg-surface-2 px-2 py-1 text-[10px] uppercase tracking-wider text-white/50">
        {formatDateShort(`${value}T12:00:00.000Z`)}
      </div>
    </div>
  );
}

function PickTimeStep({
  table,
  date,
  slots,
  loading,
  error,
  duration,
  onDurationChange,
  selectedSlotStart,
  onSelectSlot,
  durationValidForStart,
  memberCreditsRemaining,
  insufficientCredits,
  onContinue,
}: {
  table: TableWithStatus;
  date: string;
  slots: TimeSlot[] | null;
  loading: boolean;
  error: string | null;
  duration: DurationHours;
  onDurationChange: (d: DurationHours) => void;
  selectedSlotStart: string | null;
  onSelectSlot: (iso: string | null) => void;
  durationValidForStart: (iso: string) => boolean;
  memberCreditsRemaining: number;
  insufficientCredits: boolean;
  onContinue: () => void;
}) {
  const canContinue =
    !!selectedSlotStart &&
    !insufficientCredits &&
    durationValidForStart(selectedSlotStart);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/10 bg-surface-1 p-4">
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Selected table
        </p>
        <p className="mt-1 text-lg font-semibold text-white">
          Table {table.table_number}{" "}
          <span className="text-sm font-normal text-white/50">
            · {formatDateShort(`${date}T12:00:00.000Z`)}
          </span>
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-surface-1 p-4">
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Duration
        </p>
        <div className="mt-2 flex gap-2">
          {DURATIONS.map((h) => {
            const active = duration === h;
            return (
              <button
                key={h}
                type="button"
                onClick={() => {
                  onDurationChange(h);
                  // Reset selection if current start no longer fits.
                  if (
                    selectedSlotStart &&
                    !durationFitsAt(slots, selectedSlotStart, h)
                  ) {
                    onSelectSlot(null);
                  }
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent/15 text-white"
                    : "border-white/10 text-white/70 hover:bg-white/5"
                }`}
              >
                {h} hr
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-white/50">
          Uses {duration} credit{duration === 1 ? "" : "s"} · You have{" "}
          <span className={insufficientCredits ? "text-red-300" : "text-white"}>
            {memberCreditsRemaining}
          </span>
        </p>
        {insufficientCredits && (
          <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            You don&apos;t have enough credits for a {duration}-hour session.
          </p>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-surface-1 p-4">
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Available start times
        </p>

        {loading && (
          <p className="mt-3 text-sm text-white/50">Loading slots…</p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
            {error}
          </p>
        )}
        {!loading && slots && slots.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {slots.map((slot) => {
              const fits = durationValidForStart(slot.starts_at);
              const isSelected = selectedSlotStart === slot.starts_at;
              const disabled = !slot.available || !fits;
              return (
                <button
                  key={slot.starts_at}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectSlot(slot.starts_at)}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-accent bg-accent/20 text-white"
                      : disabled
                      ? "cursor-not-allowed border-white/5 bg-surface-2 text-white/30 line-through"
                      : "border-white/10 text-white/80 hover:bg-white/5"
                  }`}
                  title={
                    !slot.available
                      ? slot.reason
                      : !fits
                      ? `No ${duration}-hour window from here`
                      : undefined
                  }
                >
                  {formatTime(slot.starts_at)}
                </button>
              );
            })}
          </div>
        )}
        {!loading && slots && slots.length === 0 && (
          <p className="mt-3 text-sm text-white/50">
            No slots available on this date.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
      >
        Continue
      </button>
    </div>
  );
}

function ConfirmStep({
  table,
  startsAt,
  duration,
  creditsAfter,
  submitting,
  error,
  onConfirm,
  onBack,
}: {
  table: TableWithStatus;
  startsAt: string;
  duration: DurationHours;
  creditsAfter: number;
  submitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const endsAt = new Date(
    Date.parse(startsAt) + duration * 60 * 60 * 1000
  ).toISOString();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-surface-1 p-5">
        <p className="text-xs uppercase tracking-wider text-white/40">
          Booking summary
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Table">{`Table ${table.table_number}`}</Row>
          <Row label="Date">
            {formatDateShort(startsAt)}
          </Row>
          <Row label="Time">
            {`${formatTime(startsAt)} – ${formatTime(endsAt)}`}
          </Row>
          <Row label="Credits">
            {duration} credit{duration === 1 ? "" : "s"}
          </Row>
          <Row label="After booking">
            <span className="text-white">
              {creditsAfter} credit{creditsAfter === 1 ? "" : "s"} remaining
            </span>
          </Row>
        </dl>
      </div>

      <div className="rounded-2xl border border-white/10 bg-surface-1 p-5">
        <p className="text-xs uppercase tracking-wider text-white/40">
          Invite a member (optional)
        </p>
        <p className="mt-2 text-xs text-white/50">
          Invites can be sent from the booking detail page after confirmation.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 rounded-lg border border-white/20 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting}
          className="flex-1 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent/90 disabled:opacity-50 active:scale-[0.98]"
        >
          {submitting ? "Confirming…" : "Confirm booking"}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-white/50">{label}</dt>
      <dd className="font-medium text-white">{children}</dd>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function durationFitsAt(
  slots: TimeSlot[] | null,
  startIso: string,
  duration: DurationHours
): boolean {
  if (!slots) return false;
  const idx = slots.findIndex((s) => s.starts_at === startIso);
  if (idx === -1) return false;
  for (let i = 0; i < duration; i++) {
    const s = slots[idx + i];
    if (!s || !s.available) return false;
  }
  return true;
}
