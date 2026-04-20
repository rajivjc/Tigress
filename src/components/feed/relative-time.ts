// =============================================================================
// Feed relative-time formatter
// =============================================================================
// "2h ago" / "yesterday" / "Mar 12" — the shape the feed uses on every post
// card. Split out so it's pure and testable.
// =============================================================================

/**
 * Formats a timestamp relative to `now` for display in the feed.
 *   < 1 min   → "just now"
 *   < 60 min  → "Xm ago"
 *   < 24 h    → "Xh ago"
 *   24–48 h   → "yesterday"
 *   > 48 h    → "12 Mar" / "12 Mar 2024" (year added if not current year)
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return "";

  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 2) return "yesterday";

  const sameYear = then.getFullYear() === now.getFullYear();
  return then.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}
