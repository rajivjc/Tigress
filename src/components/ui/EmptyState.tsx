import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="mb-3 rounded-full bg-surface-2 p-3">
        <Icon size={24} className="text-white/30" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium text-white/50">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-white/30">{description}</p>
      )}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 text-sm font-medium text-accent hover:underline"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}
