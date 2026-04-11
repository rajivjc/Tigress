"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToInviteAction } from "@/app/actions/invites";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import type { InviteWithContext } from "@/lib/data/invites";
import type { BookingInviteStatus } from "@/lib/types";

interface InviteRowProps {
  entry: InviteWithContext;
}

const STATUS_STYLES: Record<BookingInviteStatus, string> = {
  pending: "bg-white/10 text-white/60",
  accepted: "bg-emerald-500/15 text-emerald-300",
  declined: "bg-red-500/15 text-red-300",
};

export function InviteRow({ entry }: InviteRowProps) {
  const router = useRouter();
  const { invite, inviter, booking, table } = entry;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRespond = (response: "accepted" | "declined") => {
    setError(null);
    startTransition(async () => {
      const result = await respondToInviteAction(invite.id, response);
      if (!result.success) {
        setError(result.error ?? "Failed to respond");
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="rounded-lg border border-white/5 bg-surface-1/80 p-3">
      <Link
        href={booking ? `/bookings/${booking.id}` : "#"}
        className="block"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">
              {inviter?.full_name ?? "Someone"} invited you
            </div>
            <div className="mt-0.5 truncate text-xs text-white/60">
              {table?.name ?? "Unknown table"}
              {booking
                ? ` · ${formatDateShort(booking.starts_at)} · ${formatTimeRange(
                    booking.starts_at,
                    booking.ends_at
                  )}`
                : ""}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_STYLES[invite.status]}`}
          >
            {invite.status}
          </span>
        </div>
      </Link>

      {invite.status === "pending" && (
        <>
          {error && (
            <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleRespond("accepted")}
              disabled={isPending}
              className="flex-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-accent/90 disabled:opacity-50 active:scale-[0.98]"
            >
              {isPending ? "…" : "Accept"}
            </button>
            <button
              type="button"
              onClick={() => handleRespond("declined")}
              disabled={isPending}
              className="flex-1 rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        </>
      )}
    </li>
  );
}
