"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { respondToInviteAction } from "@/app/actions/invites";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import type { InviteWithContext } from "@/lib/data/invites";

interface PendingInvitesProps {
  invites: InviteWithContext[];
}

export function PendingInvites({ invites: initial }: PendingInvitesProps) {
  const [invites, setInvites] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (invites.length === 0) {
    return null;
  }

  const handleRespond = (
    inviteId: string,
    response: "accepted" | "declined"
  ) => {
    setPendingId(inviteId);
    setError(null);
    startTransition(async () => {
      const result = await respondToInviteAction(inviteId, response);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        setPendingId(null);
        return;
      }
      setInvites((current) => current.filter((i) => i.invite.id !== inviteId));
      setPendingId(null);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-surface-1 p-5 shadow-xl ">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
          Pending invites
        </h3>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-medium text-accent">
          {invites.length}
        </span>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {invites.map(({ invite, inviter, booking, table }) => {
          const disabled = pendingId === invite.id;
          return (
            <li
              key={invite.id}
              className="rounded-lg border border-white/5 bg-surface-1/80 p-3"
            >
              <Link
                href={booking ? `/bookings/${booking.id}` : "#"}
                className="block"
              >
                <div className="text-sm font-medium text-white">
                  {inviter?.full_name ?? "Someone"} invited you
                </div>
                <div className="mt-0.5 text-xs text-white/60">
                  {table?.name ?? "Unknown table"}
                  {booking
                    ? ` · ${formatDateShort(booking.starts_at)} · ${formatTimeRange(
                        booking.starts_at,
                        booking.ends_at
                      )}`
                    : ""}
                </div>
              </Link>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRespond(invite.id, "accepted")}
                  disabled={disabled}
                  className="flex-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:bg-accent/90 disabled:opacity-50 active:scale-[0.98]"
                >
                  {disabled ? "…" : "Accept"}
                </button>
                <button
                  type="button"
                  onClick={() => handleRespond(invite.id, "declined")}
                  disabled={disabled}
                  className="flex-1 rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
