"use client";

// =============================================================================
// CalendarDayView
// =============================================================================
// 7-column × 14-row CSS grid (one column per table, one row per hour). Each
// booking renders as a coloured block that spans `slot.span` rows. Empty
// slots are subtle dark cells; tapping a booking expands its details panel.
// Date navigation reloads the page with a new `?date=YYYY-MM-DD` param.
// =============================================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import type { CalendarDay, CalendarSlot } from "@/lib/data/calendar";

export interface CalendarDayViewProps {
  day: CalendarDay;
}

interface SelectedBlock {
  table_number: number;
  hour: number;
  slot: CalendarSlot;
}

export function CalendarDayView({ day }: CalendarDayViewProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedBlock | null>(null);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = day.open_hour; h < day.close_hour; h++) out.push(h);
    return out;
  }, [day.open_hour, day.close_hour]);

  const goToDate = (date: string) => {
    setSelected(null);
    router.push(`/calendar?date=${date}`);
  };

  const isToday = day.date === todaySGT();

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Day view
          </p>
          <h1 className="text-xl font-bold text-white">Calendar</h1>
        </div>
      </header>

      <DateBar
        date={day.date}
        isToday={isToday}
        onChange={goToDate}
        onPrev={() => goToDate(addDaysSGT(day.date, -1))}
        onNext={() => goToDate(addDaysSGT(day.date, 1))}
        onToday={() => goToDate(todaySGT())}
      />

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-surface/60 p-3">
        <div
          role="grid"
          aria-label="Calendar day grid"
          className="grid min-w-[720px]"
          style={{
            gridTemplateColumns: `48px repeat(${day.tables.length}, minmax(80px, 1fr))`,
            gridTemplateRows: `28px repeat(${hours.length}, 56px)`,
            gap: "4px",
          }}
        >
          {/* Header row: empty corner + table labels */}
          <div />
          {day.tables.map((t) => (
            <div
              key={t.table_id}
              role="columnheader"
              className="flex items-center justify-center text-[11px] font-semibold uppercase tracking-wider text-white/60"
            >
              T{t.table_number}
            </div>
          ))}

          {/* Hour rows */}
          {hours.map((hour, rowIdx) => (
            // Each hour row contributes a label + 7 cells. We render the
            // label cell here, then map across all tables. The cells use
            // `gridRowStart` to anchor themselves correctly.
            <HourRow
              key={hour}
              hour={hour}
              rowIdx={rowIdx + 2 /* skip header row */}
              day={day}
              onSelect={(table_number, slot) =>
                setSelected({ table_number, hour, slot })
              }
            />
          ))}
        </div>
      </div>

      <Legend />

      {selected && (
        <DetailPanel
          selected={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function HourRow({
  hour,
  rowIdx,
  day,
  onSelect,
}: {
  hour: number;
  rowIdx: number;
  day: CalendarDay;
  onSelect: (table_number: number, slot: CalendarSlot) => void;
}) {
  return (
    <>
      <div
        role="rowheader"
        className="flex items-start justify-end pr-2 text-[10px] font-medium text-white/40"
        style={{ gridRow: rowIdx, gridColumn: 1 }}
      >
        {formatHourLabel(hour)}
      </div>
      {day.tables.map((table, colIdx) => {
        const slot = table.slots.find((s) => s.hour === hour);
        if (!slot) return null;
        // Suppress non-start slots for multi-hour bookings — the start cell
        // will use `gridRow: span N` to cover them.
        if (slot.span === 0) return null;
        return (
          <SlotCell
            key={`${table.table_id}-${hour}`}
            slot={slot}
            row={rowIdx}
            col={colIdx + 2 /* skip label column */}
            onClick={() => onSelect(table.table_number, slot)}
          />
        );
      })}
    </>
  );
}

function SlotCell({
  slot,
  row,
  col,
  onClick,
}: {
  slot: CalendarSlot;
  row: number;
  col: number;
  onClick: () => void;
}) {
  const span = slot.span ?? 1;
  const styles = STATUS_STYLES[slot.status];
  return (
    <button
      type="button"
      onClick={onClick}
      title={slot.label}
      className={`flex flex-col items-start justify-start overflow-hidden rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight transition-colors ${styles.classes}`}
      style={{
        gridRow: `${row} / span ${span}`,
        gridColumn: col,
      }}
    >
      {slot.status !== "available" && (
        <>
          <span className="block w-full truncate font-semibold">
            {slot.label ?? "—"}
          </span>
          <span className="mt-auto block text-[9px] uppercase tracking-wider opacity-70">
            {STATUS_STYLES[slot.status].badge}
          </span>
        </>
      )}
    </button>
  );
}

function DateBar({
  date,
  isToday,
  onChange,
  onPrev,
  onNext,
  onToday,
}: {
  date: string;
  isToday: boolean;
  onChange: (d: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface/60 p-3">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous day"
        className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
      >
        ←
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => onChange(e.target.value || date)}
        className="flex-1 bg-transparent text-sm font-medium text-white outline-none"
      />
      <button
        type="button"
        onClick={onNext}
        aria-label="Next day"
        className="rounded-full border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
      >
        →
      </button>
      <button
        type="button"
        onClick={onToday}
        disabled={isToday}
        className="rounded-md border border-white/10 px-3 py-1 text-xs font-medium text-white/70 hover:bg-white/5 disabled:opacity-40"
      >
        Today
      </button>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-white/60">
      {(Object.entries(STATUS_STYLES) as [
        keyof typeof STATUS_STYLES,
        (typeof STATUS_STYLES)[keyof typeof STATUS_STYLES]
      ][]).map(([key, style]) => (
        <li key={key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-sm ${style.swatch}`}
          />
          <span>{style.label}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailPanel({
  selected,
  onClose,
}: {
  selected: SelectedBlock;
  onClose: () => void;
}) {
  const slot = selected.slot;
  return (
    <div className="rounded-xl border border-white/10 bg-surface/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Table {selected.table_number} · {formatHourLabel(selected.hour)}
          </p>
          <p className="mt-1 text-base font-semibold text-white">
            {slot.label ?? STATUS_STYLES[slot.status].label}
          </p>
          {slot.span && slot.span > 1 && (
            <p className="text-xs text-white/60">
              {slot.span} hour session
            </p>
          )}
          {slot.booking_id && (
            <a
              href={`/bookings/${slot.booking_id}`}
              className="mt-2 inline-block text-xs text-accent hover:underline"
            >
              View booking →
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:bg-white/5"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ---------- Style + format helpers ----------

const STATUS_STYLES = {
  available: {
    classes: "border-white/5 bg-black/20 text-white/40 hover:bg-white/5",
    label: "Available",
    badge: "free",
    swatch: "bg-black/40 border border-white/10",
  },
  booked_member: {
    classes:
      "border-accent/40 bg-accent/15 text-white hover:bg-accent/20",
    label: "Member",
    badge: "member",
    swatch: "bg-accent/40",
  },
  booked_walkin: {
    classes:
      "border-amber-400/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/25",
    label: "Walk-in",
    badge: "walk-in",
    swatch: "bg-amber-400/40",
  },
  blocked: {
    classes:
      "border-white/20 bg-white/10 text-white/70 hover:bg-white/15",
    label: "Blocked",
    badge: "blocked",
    swatch: "bg-white/30",
  },
} as const;

// Calendar labels are 24h in SGT — formatted directly for unambiguous
// staff-facing display.
function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
