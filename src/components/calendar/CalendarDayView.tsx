"use client";

// =============================================================================
// CalendarDayView
// =============================================================================
// Responsive calendar day view.
//
// - Mobile (< md): agenda list showing only booked/blocked slots, grouped by
//   start hour. Taps on a booking card navigate to /bookings/{id}.
// - Desktop (>= md): 7-column × 14-row CSS grid (one column per table, one
//   row per hour). Bookings render as coloured blocks that span `slot.span`
//   rows. Empty slots are subtle dark cells; tapping a booking expands its
//   details panel. Date navigation reloads the page with a new
//   `?date=YYYY-MM-DD` param.
// =============================================================================

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { addDaysSGT, todaySGT } from "@/lib/timezone";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CalendarDay, CalendarSlot } from "@/lib/data/calendar";

export interface CalendarDayViewProps {
  day: CalendarDay;
}

interface SelectedBlock {
  table_number: number;
  hour: number;
  slot: CalendarSlot;
}

/** A booking/block slot flattened with its owning table number. */
interface AgendaEntry {
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

      {/* Mobile: compact agenda list of booked/blocked slots only. */}
      <div className="space-y-3 md:hidden">
        <AgendaSummary day={day} />
        <AgendaList day={day} />
      </div>

      {/* Desktop: full 7-column grid. */}
      <div className="hidden md:block">
        <DayGrid
          day={day}
          hours={hours}
          onSelect={(table_number, hour, slot) =>
            setSelected({ table_number, hour, slot })
          }
        />
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

// ---------- Desktop grid ----------

function DayGrid({
  day,
  hours,
  onSelect,
}: {
  day: CalendarDay;
  hours: number[];
  onSelect: (table_number: number, hour: number, slot: CalendarSlot) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-surface-1 p-3">
      <div
        role="grid"
        aria-label="Calendar day grid"
        className="grid"
        style={{
          gridTemplateColumns: `48px repeat(${day.tables.length}, minmax(0, 1fr))`,
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
          // Each hour row contributes a label + N cells. We render the
          // label cell here, then map across all tables. The cells use
          // `gridRowStart` to anchor themselves correctly.
          <HourRow
            key={hour}
            hour={hour}
            rowIdx={rowIdx + 2 /* skip header row */}
            day={day}
            onSelect={(table_number, slot) => onSelect(table_number, hour, slot)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Mobile agenda list ----------

function AgendaSummary({ day }: { day: CalendarDay }) {
  const counts = useMemo(() => countAgendaEntries(day), [day]);
  const parts: string[] = [];
  if (counts.member > 0) {
    parts.push(`${counts.member} member`);
  }
  if (counts.walkin > 0) {
    parts.push(`${counts.walkin} walk-in`);
  }
  if (counts.blocked > 0) {
    parts.push(`${counts.blocked} blocked`);
  }
  const label = parts.length === 0 ? "No activity today" : parts.join(" · ");
  return (
    <div className="rounded-xl border border-white/10 bg-surface-1 px-4 py-3 text-xs text-white/70">
      {label}
    </div>
  );
}

function AgendaList({ day }: { day: CalendarDay }) {
  const groups = useMemo(() => groupAgendaByHour(collectAgendaEntries(day)), [day]);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-surface-1">
        <EmptyState
          icon={CalendarDays}
          title="No bookings today"
          description="Booked and blocked slots will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.hour} className="space-y-2">
          <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/50 backdrop-blur">
            {formatHourLabel(group.hour)}
          </div>
          <ul className="space-y-2">
            {group.entries.map((entry) => (
              <li key={`${entry.table_number}-${entry.hour}`}>
                <AgendaCard entry={entry} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AgendaCard({ entry }: { entry: AgendaEntry }) {
  const { slot, table_number } = entry;
  const style = STATUS_STYLES[slot.status];
  const accent = AGENDA_ACCENTS[slot.status];
  const durationLabel = `${slot.span ?? 1}h`;
  const label = slot.label ?? style.label;

  const body = (
    <div
      className={`flex items-center gap-3 rounded-xl border border-white/10 bg-surface-1 p-3 ${accent.border}`}
    >
      <span
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold ${accent.badge}`}
      >
        T{table_number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{label}</p>
        <p className="text-[11px] uppercase tracking-wider text-white/50">
          {style.label} · {durationLabel}
        </p>
      </div>
      {slot.booking_id && (
        <span aria-hidden="true" className="text-white/30">
          ›
        </span>
      )}
    </div>
  );

  if (slot.booking_id) {
    return (
      <Link
        href={`/bookings/${slot.booking_id}`}
        className="block transition-colors hover:bg-white/5"
      >
        {body}
      </Link>
    );
  }

  return body;
}

// ---------- Agenda helpers ----------

function collectAgendaEntries(day: CalendarDay): AgendaEntry[] {
  const entries: AgendaEntry[] = [];
  for (const table of day.tables) {
    for (const slot of table.slots) {
      if (slot.status === "available") continue;
      // `span === 0` marks continuation cells of a multi-hour booking.
      if (slot.span === 0) continue;
      entries.push({
        table_number: table.table_number,
        hour: slot.hour,
        slot,
      });
    }
  }
  return entries;
}

function groupAgendaByHour(entries: AgendaEntry[]): {
  hour: number;
  entries: AgendaEntry[];
}[] {
  const byHour = new Map<number, AgendaEntry[]>();
  for (const entry of entries) {
    const bucket = byHour.get(entry.hour) ?? [];
    bucket.push(entry);
    byHour.set(entry.hour, bucket);
  }
  return Array.from(byHour.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, list]) => ({
      hour,
      entries: list.slice().sort((a, b) => a.table_number - b.table_number),
    }));
}

function countAgendaEntries(day: CalendarDay): {
  member: number;
  walkin: number;
  blocked: number;
} {
  let member = 0;
  let walkin = 0;
  let blocked = 0;
  for (const entry of collectAgendaEntries(day)) {
    if (entry.slot.status === "booked_member") member += 1;
    else if (entry.slot.status === "booked_walkin") walkin += 1;
    else if (entry.slot.status === "blocked") blocked += 1;
  }
  return { member, walkin, blocked };
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
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface-1 p-3">
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
    <div className="rounded-xl border border-white/10 bg-surface-2 p-4">
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
    classes: "border-white/5 bg-surface-1/80 text-white/40 hover:bg-white/5",
    label: "Available",
    badge: "free",
    swatch: "bg-surface-3 border border-white/10",
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

/** Accent treatments used by the mobile agenda cards. */
const AGENDA_ACCENTS: Record<
  CalendarSlot["status"],
  { border: string; badge: string }
> = {
  available: {
    border: "border-l-4 border-l-white/10",
    badge: "bg-white/10 text-white/60",
  },
  booked_member: {
    border: "border-l-4 border-l-accent",
    badge: "bg-accent/20 text-accent",
  },
  booked_walkin: {
    border: "border-l-4 border-l-amber-400",
    badge: "bg-amber-400/20 text-amber-200",
  },
  blocked: {
    border: "border-l-4 border-l-white/40",
    badge: "bg-white/15 text-white/70",
  },
};

// Calendar labels are 24h in SGT — formatted directly for unambiguous
// staff-facing display.
function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
