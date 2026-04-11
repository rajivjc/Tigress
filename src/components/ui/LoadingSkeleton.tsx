export function LoadingSkeleton() {
  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto max-w-md space-y-4 pt-16">
        {/* Membership card skeleton */}
        <div className="h-28 animate-shimmer rounded-2xl bg-surface-1" />
        {/* Credits card skeleton */}
        <div
          className="h-48 animate-shimmer rounded-2xl bg-surface-1"
          style={{ animationDelay: "0.15s" }}
        />
        {/* Bookings skeleton */}
        <div
          className="h-32 animate-shimmer rounded-2xl bg-surface-1"
          style={{ animationDelay: "0.3s" }}
        />
      </div>
    </div>
  );
}
