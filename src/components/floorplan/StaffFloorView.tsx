"use client";

// =============================================================================
// StaffFloorView
// =============================================================================
// Client wrapper for the staff /floor page. Renders the shared FloorplanLayout
// + TableDetailPanel, but with a staff/manager/owner-aware detail panel and a
// "Today's activity" summary strip below the floor view.
//
// Uses useFloorplanRealtime to keep the table statuses fresh — polls every 30s
// and re-fetches on tab focus + on Supabase Realtime postgres_changes events.
// =============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FloorplanLayout } from "./FloorplanLayout";
import { TableDetailPanel } from "./TableDetailPanel";
import { useFloorplanRealtime } from "@/hooks/useFloorplanRealtime";
import { unblockSlotForTableAction } from "@/app/actions/block";
import type { TableWithStatus } from "@/lib/data/tables";
import type { UserRole } from "@/lib/types";

export interface StaffFloorViewProps {
  initialTables: TableWithStatus[];
  /** "staff" | "manager" | "owner" — controls which actions are visible. */
  userRole: UserRole;
  /** Activity summary for "today" — computed server-side in SGT. */
  todayActivity: TodayActivity;
}

export interface TodayActivity {
  date: string; // YYYY-MM-DD in SGT
  totalBookings: number;
  occupiedNow: number;
  upcomingNext2h: number;
}

export function StaffFloorView({
  initialTables,
  userRole,
  todayActivity,
}: StaffFloorViewProps) {
  const router = useRouter();
  const { tables, refresh, lastUpdatedAt } = useFloorplanRealtime(
    initialTables
  );
  const [selectedTableId, setSelectedTableId] = useState<string | undefined>();
  const [unblockError, setUnblockError] = useState<string | null>(null);
  const [unblockPending, startUnblock] = useTransition();

  const selectedTable = useMemo(
    () =>
      selectedTableId
        ? tables.find((t) => t.id === selectedTableId) ?? null
        : null,
    [tables, selectedTableId]
  );

  const handleUnblock = (tableId: string) => {
    setUnblockError(null);
    startUnblock(async () => {
      const res = await unblockSlotForTableAction(tableId);
      if (!res.success) {
        setUnblockError(res.error ?? "Failed to unblock table");
        return;
      }
      setSelectedTableId(undefined);
      await refresh();
      router.refresh();
    });
  };

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Live floor
          </p>
          <h1 className="text-xl font-bold text-white">Floorplan</h1>
        </div>
        <p className="text-[10px] uppercase tracking-wider text-white/30">
          Updated {formatRelative(lastUpdatedAt)}
        </p>
      </header>

      <FloorplanLayout
        tables={tables}
        selectedTableId={selectedTableId}
        onSelectTable={(id) => setSelectedTableId(id)}
        userRole={userRole}
      />

      <ActivityStrip activity={todayActivity} />

      {unblockError && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {unblockError}
        </p>
      )}

      {selectedTable && (
        <TableDetailPanel
          table={selectedTable}
          userRole={userRole}
          onClose={() => setSelectedTableId(undefined)}
          onUnblock={unblockPending ? undefined : handleUnblock}
        />
      )}
    </div>
  );
}

// =============================================================================
// Activity strip
// =============================================================================

function ActivityStrip({ activity }: { activity: TodayActivity }) {
  const items = [
    { label: "Bookings today", value: activity.totalBookings },
    { label: "Tables in use", value: activity.occupiedNow },
    { label: "Next 2 hours", value: activity.upcomingNext2h },
  ];
  return (
    <section
      aria-label="Today's activity"
      className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-surface/60 p-4"
    >
      {items.map((item) => (
        <div key={item.label} className="text-center">
          <p className="text-2xl font-bold text-white">{item.value}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
            {item.label}
          </p>
        </div>
      ))}
    </section>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatRelative(epochMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  return `${m}m ago`;
}
