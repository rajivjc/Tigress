"use client";

// =============================================================================
// CalendarWeekView
// =============================================================================
// Responsive week summary for the staff /calendar page (second tab).
//
// - Mobile (< md): vertical list of day cards with a utilisation bar showing
//   total bookings across all tables for the day, normalised to the busiest
//   day of the week. Tapping a card jumps to the day view.
// - Desktop (>= md): 7 columns (Monday → Sunday) × N table rows heat-map.
//   Each cell colours in proportion to how many bookings touch that table on
//   that date. Tapping a cell navigates to the day view for that date.
// =============================================================================

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { formatDateShort } from "@/lib/format";
import type { CalendarWeek } from "@/lib/data/calendar";

export interface CalendarWeekViewProps {
  week: CalendarWeek;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface DaySummary {
  date: string;
  dayLabel: string;
  booking_count: number;
  block_count: number;
  no_show_count: number;
  is_today: boolean;
}

export function CalendarWeekView({ week }: CalendarWeekViewProps) {
  const router = useRouter();
  const today = todaySGT();

  const goToDay = (date: string) => {
    router.push(`/calendar?date=${date}&view=day`);
  };

  const goToWeek = (anchor: string) => {
    router.push(`/calendar?date=${anchor}&view=week`);
  };

  const daySummaries: DaySummary[] = useMemo(() => {
    return week.dates.map((date, idx) => {
      let booking_count = 0;
      let block_count = 0;
      let no_show_count = 0;
      for (const row of week.grid) {
        const cell = row[idx];
        if (!cell) continue;
        booking_count += cell.booking_count;
        block_count += cell.block_count;
        no_show_count += cell.no_show_count;
      }
      return {
        date,
        dayLabel: DAY_LABELS[idx] ?? "",
        booking_count,
        block_count,
        no_show_count,
        is_today: date === today,
      };
    });
  }, [week.dates, week.grid, today]);

  const maxBookings = useMemo(
    () => daySummaries.reduce((acc, d) => Math.max(acc, d.booking_count), 0),
    [daySummaries]
  );

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

      {/* Mobile: vertical list of day cards with utilisation bars. */}
      <div className="space-y-2 md:hidden">
        {daySummaries.map((day) => (
          <DayCard
            key={day.date}
            day={day}
            maxBookings={maxBookings}
            onSelect={() => goToDay(day.date)}
          />
        ))}
      </div>

      {/* Desktop: heat-map grid. */}
      <div className="hidden md:block">
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
      </div>

      <p className="px-1 text-center text-[11px] text-white/50">
        <span className="hidden md:inline">
          Tap a cell to jump to that day. Intensity = total bookings.
        </span>
        <span className="md:hidden">
          Tap a day to see its schedule.
        </span>
      </p>
    </div>
  );
}

function DayCard({
  day,
  maxBookings,
  onSelect,
}: {
  day: DaySummary;
  maxBookings: number;
  onSelect: () => void;
}) {
  // Normalise against the busiest day of the visible week so the bars give
  // relative (rather than absolute) pressure. If the week is empty we show
  // a zero-width bar.
  const fillPct =
    maxBookings > 0
      ? Math.max(4, Math.round((day.booking_count / maxBookings) * 100))
      : 0;
  const bookingLabel = `${day.booking_count} booking${
    day.booking_count === 1 ? "" : "s"
  }`;
  const extras: string[] = [];
  if (day.block_count > 0) {
    extras.push(
      `${day.block_count} block${day.block_count === 1 ? "" : "s"}`
    );
  }
  if (day.no_show_count > 0) {
    extras.push(
      `${day.no_show_count} no-show${day.no_show_count === 1 ? "" : "s"}`
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors ${
        day.is_today
          ? "border-accent/50 bg-accent/10"
          : "border-white/10 bg-surface-1 hover:bg-white/5"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            {day.dayLabel}{" "}
            <span className="font-normal text-white/70">
              {formatDateShort(`${day.date}T12:00:00.000Z`).replace(/^\w+\s/, "")}
            </span>
          </p>
          <p className="text-[11px] uppercase tracking-wider text-white/50">
            {bookingLabel}
            {extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}
          </p>
        </div>
        {day.is_today && (
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            Today
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={`h-full rounded-full transition-[width] ${
            day.is_today ? "bg-accent" : "bg-accent/60"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </button>
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
        const noShowSuffix = cell.no_show_count
          ? `, ${cell.no_show_count} no-show${
              cell.no_show_count === 1 ? "" : "s"
            }`
          : "";
        return (
          <button
            key={cell.date}
            type="button"
            onClick={() => onSelect(cell.date)}
            className={`relative flex h-10 items-center justify-center rounded-md border border-white/5 text-[11px] font-medium text-white/90 transition-colors hover:border-accent/50 ${bgClass}`}
            title={`${cell.booking_count} booking${
              cell.booking_count === 1 ? "" : "s"
            }${cell.block_count ? `, ${cell.block_count} block(s)` : ""}${noShowSuffix}`}
          >
            {total === 0 ? (
              <span className="text-white/30">—</span>
            ) : (
              <span>{total}</span>
            )}
            {cell.no_show_count > 0 && (
              <span
                aria-hidden="true"
                className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-400"
              />
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
