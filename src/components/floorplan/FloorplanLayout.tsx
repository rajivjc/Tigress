"use client";

// =============================================================================
// FloorplanLayout
// =============================================================================
// Renders a bird's-eye view of the 7 pool tables. Uses an SVG canvas with a
// preserved viewBox so the layout scales down to narrow mobile screens while
// staying tap-friendly. Each table is an interactive rectangle with a glow
// keyed to its computed status.
// =============================================================================

import type { TableWithStatus, ComputedTableStatus } from "@/lib/data/tables";
import type { UserRole } from "@/lib/types";

export interface FloorplanLayoutProps {
  tables: TableWithStatus[];
  selectedTableId?: string;
  onSelectTable: (tableId: string) => void;
  // Reserved for future use (staff-only badges, etc). Kept on the interface
  // to match the spec.
  userRole?: UserRole;
  /**
   * Override the default status labels shown on the table bodies. Used by the
   * member booking flow so "occupied" reads as "Full" in that context.
   */
  statusLabels?: Partial<Record<ComputedTableStatus, string>>;
  /**
   * Table ids where the viewing member already has a confirmed booking on
   * the currently-selected day. Rendered as a small accent badge to hint
   * "YOUR BOOKING" without blocking the member from booking another slot.
   */
  memberBookingTableIds?: ReadonlySet<string>;
}

// ---------- Layout geometry ----------
// Coordinates are in SVG viewBox units. We use a 1000x700 canvas that
// represents a roughly rectangular pool hall. Tables are 200x100 each.

interface TablePosition {
  table_number: number;
  x: number;
  y: number;
  angle?: number; // degrees, for slight rotation
}

const TABLE_W = 200;
const TABLE_H = 100;

const LAYOUT: TablePosition[] = [
  // Top row (3 tables along the back wall)
  { table_number: 1, x: 60, y: 60 },
  { table_number: 2, x: 330, y: 60 },
  { table_number: 3, x: 600, y: 60 },
  // Middle feature table, slightly angled
  { table_number: 4, x: 180, y: 290, angle: -6 },
  { table_number: 5, x: 600, y: 290, angle: 6 },
  // Bottom row (2 tables along the front wall)
  { table_number: 6, x: 100, y: 530 },
  { table_number: 7, x: 560, y: 530 },
];

// ---------- Status styling ----------

interface StatusStyle {
  fill: string;
  stroke: string;
  glow: string;
  label: string;
  labelColor: string;
}

const STATUS_STYLES: Record<ComputedTableStatus, StatusStyle> = {
  available: {
    fill: "#0c2e22",
    stroke: "#10B981",
    glow: "rgba(16, 185, 129, 0.55)",
    label: "Open",
    labelColor: "#34d399",
  },
  occupied: {
    fill: "#2d1e0a",
    stroke: "#F59E0B",
    glow: "rgba(245, 158, 11, 0.55)",
    label: "In use",
    labelColor: "#fbbf24",
  },
  reserved: {
    fill: "#10203d",
    stroke: "#3B82F6",
    glow: "rgba(59, 130, 246, 0.55)",
    label: "Reserved",
    labelColor: "#60a5fa",
  },
  blocked: {
    fill: "#1a1a24",
    stroke: "#6B7280",
    glow: "rgba(107, 114, 128, 0.35)",
    label: "Blocked",
    labelColor: "#9ca3af",
  },
};

// ---------- Component ----------

export function FloorplanLayout({
  tables,
  selectedTableId,
  onSelectTable,
  statusLabels,
  memberBookingTableIds,
}: FloorplanLayoutProps) {
  // Map table_number → TableWithStatus so layout order is deterministic.
  const byNumber = new Map<number, TableWithStatus>();
  for (const t of tables) byNumber.set(t.table_number, t);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0b1020] via-[#0a0f1e] to-[#070c18] p-3 shadow-xl">
      {/* Ambient room lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(233, 69, 96, 0.08), transparent 55%), radial-gradient(circle at 75% 80%, rgba(59, 130, 246, 0.08), transparent 50%)",
        }}
      />

      <svg
        viewBox="0 0 900 700"
        className="relative z-10 h-auto w-full"
        role="img"
        aria-label="Floorplan of the pool hall"
      >
        <defs>
          {Object.entries(STATUS_STYLES).map(([status, style]) => (
            <filter
              key={status}
              id={`glow-${status}`}
              x="-30%"
              y="-30%"
              width="160%"
              height="160%"
            >
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feFlood floodColor={style.glow} result="color" />
              <feComposite in="color" in2="blur" operator="in" result="shadow" />
              <feMerge>
                <feMergeNode in="shadow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Floor subtle grid */}
        <rect
          x="10"
          y="10"
          width="880"
          height="680"
          rx="20"
          fill="#050816"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
        <g stroke="rgba(255,255,255,0.03)" strokeWidth="1">
          {Array.from({ length: 9 }).map((_, i) => (
            <line
              key={`h-${i}`}
              x1="10"
              y1={10 + (i + 1) * 70}
              x2="890"
              y2={10 + (i + 1) * 70}
            />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <line
              key={`v-${i}`}
              x1={10 + (i + 1) * 80}
              y1="10"
              x2={10 + (i + 1) * 80}
              y2="690"
            />
          ))}
        </g>

        {/* Entrance label */}
        <text
          x="450"
          y="685"
          textAnchor="middle"
          fontSize="14"
          fill="rgba(255,255,255,0.3)"
          letterSpacing="4"
        >
          ENTRANCE
        </text>

        {/* Tables */}
        {LAYOUT.map((pos) => {
          const table = byNumber.get(pos.table_number);
          if (!table) return null;

          const style = STATUS_STYLES[table.computed_status];
          const label =
            statusLabels?.[table.computed_status] ?? style.label;
          const isSelected = selectedTableId === table.id;
          const hasMemberBooking =
            memberBookingTableIds?.has(table.id) ?? false;
          const cx = pos.x + TABLE_W / 2;
          const cy = pos.y + TABLE_H / 2;

          return (
            <g
              key={table.id}
              transform={pos.angle ? `rotate(${pos.angle} ${cx} ${cy})` : undefined}
              onClick={() => onSelectTable(table.id)}
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={`Table ${table.table_number} — ${label}${
                hasMemberBooking ? " (your booking)" : ""
              }`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTable(table.id);
                }
              }}
            >
              {/* Selection halo */}
              {isSelected && (
                <rect
                  x={pos.x - 8}
                  y={pos.y - 8}
                  width={TABLE_W + 16}
                  height={TABLE_H + 16}
                  rx="14"
                  fill="none"
                  stroke="#E94560"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                />
              )}

              {/* Table body */}
              <rect
                x={pos.x}
                y={pos.y}
                width={TABLE_W}
                height={TABLE_H}
                rx="10"
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth="3"
                filter={`url(#glow-${table.computed_status})`}
              />

              {/* Felt highlight */}
              <rect
                x={pos.x + 10}
                y={pos.y + 10}
                width={TABLE_W - 20}
                height={TABLE_H - 20}
                rx="6"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />

              {/* Table number */}
              <text
                x={pos.x + 18}
                y={pos.y + 34}
                fontSize="22"
                fontWeight="700"
                fill="white"
              >
                {table.table_number}
              </text>

              {/* Status label */}
              <text
                x={pos.x + TABLE_W / 2}
                y={pos.y + TABLE_H - 20}
                textAnchor="middle"
                fontSize="16"
                fontWeight="600"
                fill={style.labelColor}
                letterSpacing="1"
              >
                {label.toUpperCase()}
              </text>

              {/* "Your booking" accent badge */}
              {hasMemberBooking && (
                <g>
                  <circle
                    cx={pos.x + TABLE_W - 18}
                    cy={pos.y + 18}
                    r="8"
                    fill="#E94560"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                  <text
                    x={pos.x + TABLE_W - 60}
                    y={pos.y + 22}
                    textAnchor="end"
                    fontSize="10"
                    fontWeight="700"
                    fill="#fca5b7"
                    letterSpacing="1"
                  >
                    YOURS
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <ul className="relative z-10 mt-3 flex flex-wrap gap-x-4 gap-y-2 px-1 text-[11px] text-white/60">
        {(Object.keys(STATUS_STYLES) as ComputedTableStatus[]).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: STATUS_STYLES[s].stroke }}
            />
            <span>{statusLabels?.[s] ?? STATUS_STYLES[s].label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
