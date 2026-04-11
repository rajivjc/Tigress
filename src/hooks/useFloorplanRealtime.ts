"use client";

// =============================================================================
// useFloorplanRealtime
// =============================================================================
// Keeps an in-memory list of TableWithStatus fresh while the user has the
// floor view open. Two strategies:
//
//   1. Real Supabase mode — subscribes to Postgres changes on `bookings` and
//      `blocked_slots`. Any change triggers a re-fetch via the server action.
//   2. Mock / fallback — polls the server action every 30 seconds.
//
// In both cases the hook also re-fetches when the tab regains focus, since
// many users will alt-tab back to the floor view after handling a customer.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { getTablesWithStatusAction } from "@/app/actions/tables";
import { createClient } from "@/lib/supabase/client";
import type { TableWithStatus } from "@/lib/data/tables";

const POLL_INTERVAL_MS = 30_000;

export interface UseFloorplanRealtimeOptions {
  /** Disable polling/subscriptions entirely (used in tests). */
  enabled?: boolean;
  /** Override the polling cadence in milliseconds. */
  pollIntervalMs?: number;
}

export interface UseFloorplanRealtimeResult {
  tables: TableWithStatus[];
  refresh: () => Promise<void>;
  lastUpdatedAt: number;
}

export function useFloorplanRealtime(
  initialTables: TableWithStatus[],
  options: UseFloorplanRealtimeOptions = {}
): UseFloorplanRealtimeResult {
  const { enabled = true, pollIntervalMs = POLL_INTERVAL_MS } = options;

  const [tables, setTables] = useState<TableWithStatus[]>(initialTables);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now());
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { tables: next } = await getTablesWithStatusAction();
      setTables(next);
      setLastUpdatedAt(Date.now());
    } catch {
      // Network blip — keep showing the last known state.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Polling fallback. Always enabled (even when Realtime is wired) so that
  // dropped subscriptions don't leave the floor view stale.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, pollIntervalMs, refresh]);

  // Re-fetch whenever the tab regains focus.
  useEffect(() => {
    if (!enabled) return;
    const handler = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [enabled, refresh]);

  // Optional Supabase Realtime subscription. Only attempts to connect when
  // the env vars are present at build time; in mock mode this no-ops.
  useEffect(() => {
    if (!enabled) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return;

    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel("floorplan-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => void refresh()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocked_slots" },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { tables, refresh, lastUpdatedAt };
}
