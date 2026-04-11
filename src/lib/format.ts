// =============================================================================
// Shared formatting helpers used across member-facing pages.
// =============================================================================

/** "Sat 12 Apr" */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Jan 2025" */
export function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
}

/** "May 15" */
export function formatMonthDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
  });
}

/** "7:00 PM" */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "7:00 – 9:00 PM" */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

/** "$100.00" — formats a cents value as SGD for display. */
export function formatSGDCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    minimumFractionDigits: 2,
  }).format(dollars);
}

/** Returns uppercased initials, e.g. "Mona Member" → "MM". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
