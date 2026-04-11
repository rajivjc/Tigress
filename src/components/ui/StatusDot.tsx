import type { SubscriptionStatus } from "@/lib/types";

const PALETTE: Record<
  SubscriptionStatus,
  { color: string; label: string }
> = {
  active: { color: "bg-emerald-400", label: "Active" },
  past_due: { color: "bg-amber-400", label: "Payment overdue" },
  cancelled: { color: "bg-red-400", label: "Cancelled" },
  none: { color: "bg-white/30", label: "No subscription" },
};

interface StatusDotProps {
  status: SubscriptionStatus;
  showLabel?: boolean;
  className?: string;
}

export function StatusDot({
  status,
  showLabel = true,
  className,
}: StatusDotProps) {
  const entry = PALETTE[status];
  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${entry.color}`}
        aria-hidden
      />
      {showLabel && (
        <span className="text-xs text-white/70">{entry.label}</span>
      )}
    </span>
  );
}
