"use client";

// =============================================================================
// CalendarWeekView
// =============================================================================
// Summary grid for the staff /calendar page, second tab. Renders 7 columns
// (Monday → Sunday) × N table rows. Each cell is a heat indicator based on
// how many bookings touch that table on that date. Tapping a cell navigates
// to the day view for that date.
// =============================================================================

import { useRouter } from "next/navigation";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { formatDateShort } from "@/lib/format";
import type { CalendarWeek } from "@/lib/data/calendar";

export interface CalendarWeekViewProps {
  week: CalendarWeek;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarWeekView({ week }: CalendarWeekViewProps) {
  const router = useRouter();
  const today = todaySGT();

  const goToDay = (date: string) => {
    router.push(`/calendar?date=${date}&view=day`);
  };

  const goToWeek = (anchor: string) => {
    router.push(`/calendar?date=${anchor}&view=week`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goToWeek(addDaysSGT(week.week_start, -7))}
          className="rounded-md border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/5"
        >
          ← Prev week
        </button>
        <div className="text-center text-xs text-white/50">
          Week of {formatDateShort(`${week.week_start}T12:00:00.000Z`)}
        </div>
        <button
          type="button"
          onClick={() => goToWeek(addDaysSGT(week.week_start, 7))}
          className="rounded-md border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/5"
        >
          Next week →
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-surface-1 p-3">
        <div
          className="grid min-w-[560px] gap-1"
          style={{
            gridTemplateColumns: `48px repeat(7, minmax(64px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div />
          {week.dates.map((date, idx) => {
            const isToday = date === today;
            return (
              <button
                key={date}
                type="button"
                onClick={() => goToDay(date)}
                className={`rounded-md px-1 py-1 text-center text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  isToday
                    ? "bg-accent/15 text-white"
                    : "text-white/60 hover:bg-white/5"
                }`}
              >
                <div>{DAY_LABELS[idx]}</div>
                <div className="text-[9px] font-normal text-white/40">
                  {date.slice(-2)}
                </div>
              </button>
            );
          })}

          {/* Table rows */}
          {week.tables.map((table, tableIdx) => (
            <WeekRow
              key={table.id}
              tableNumber={table.table_number}
              cells={week.grid[tableIdx] ?? []}
              onSelect={goToDay}
            />
          ))}
        </div>
      </div>

      <p className="px-1 text-center text-[11px] text-white/50">
        Tap a cell to jump to that day. Intensity = total bookings.
      </p>
    </div>
  );
}

function WeekRow({
  tableNumber,
  cells,
  onSelect,
}: {
  tableNumber: number;
  cells: CalendarWeek["grid"][number];
  onSelect: (date: string) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-center text-[11px] font-semibold text-white/60">
        T{tableNumber}
      </div>
      {cells.map((cell) => {
        const total = cell.booking_count + cell.block_count;
        const intensity = Math.min(total, 5); // cap for colour scale
        const bgClass = intensityClass(intensity, cell.block_count > 0);
        return (
          <button
            key={cell.date}
            type="button"
            onClick={() => onSelect(cell.date)}
            className={`flex h-10 items-center justify-center rounded-md border border-white/5 text-[11px] font-medium text-white/90 transition-colors hover:border-accent/50 ${bgClass}`}
            title={`${cell.booking_count} booking${
              cell.booking_count === 1 ? "" : "s"
            }${cell.block_count ? `, ${cell.block_count} block(s)` : ""}`}
          >
            {total === 0 ? (
              <span className="text-white/30">—</span>
            ) : (
              <span>{total}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

function intensityClass(level: number, hasBlock: boolean): string {
  if (hasBlock && level === 0) return "bg-amber-500/20";
  switch (level) {
    case 0:
      return "bg-surface-1/80";
    case 1:
      return "bg-accent/10";
    case 2:
      return "bg-accent/25";
    case 3:
      return "bg-accent/40";
    case 4:
      return "bg-accent/55";
    default:
      return "bg-accent/70";
  }
}
