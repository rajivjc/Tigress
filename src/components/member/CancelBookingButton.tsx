"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelBookingAction } from "@/app/actions/bookings";

interface CancelBookingButtonProps {
  bookingId: string;
  creditsUsed: number;
}

export function CancelBookingButton({
  bookingId,
  creditsUsed,
}: CancelBookingButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelBookingAction(bookingId);
      if (!result.success) {
        setError(result.error ?? "Failed to cancel");
        return;
      }
      router.refresh();
    });
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-lg border border-red-500/40 px-4 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/10"
      >
        Cancel booking
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
      <p className="text-xs text-white/80">
        Cancel this booking?
        {creditsUsed > 0 && (
          <>
            {" "}
            <span className="text-white/60">
              {creditsUsed} credit{creditsUsed === 1 ? "" : "s"} will be refunded.
            </span>
          </>
        )}
      </p>
      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="flex-1 rounded-md bg-red-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500/90 disabled:opacity-50"
        >
          {isPending ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="flex-1 rounded-md border border-white/20 px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          Keep it
        </button>
      </div>
    </div>
  );
}
