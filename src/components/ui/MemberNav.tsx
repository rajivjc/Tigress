"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, CalendarDays, User, type LucideIcon } from "lucide-react";

const links: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/book", label: "Book", icon: PlusCircle },
  { href: "/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/profile", label: "Profile", icon: User },
];

interface MemberNavProps {
  /**
   * Number of pending booking invites for the current member. When > 0, a
   * small accent dot is shown on the Home tab as a discoverability cue —
   * tapping Home lands on the dashboard where the invites card lives.
   */
  pendingInviteCount?: number;
}

export function MemberNav({ pendingInviteCount = 0 }: MemberNavProps) {
  const pathname = usePathname();
  const hasInvites = pendingInviteCount > 0;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 py-3">
        {links.map((link) => {
          const active = pathname === link.href;
          const showBadge = hasInvites && link.href === "/dashboard";
          const Icon = link.icon;
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex flex-col items-center gap-1 text-xs transition-colors ${
                  active ? "text-accent" : "text-white/50 hover:text-white"
                }`}
                aria-label={
                  showBadge
                    ? `${link.label} — ${pendingInviteCount} pending invite${
                        pendingInviteCount === 1 ? "" : "s"
                      }`
                    : link.label
                }
              >
                <span
                  className={`relative flex items-center justify-center rounded-xl px-3 py-1.5 transition-colors ${
                    active ? "bg-accent/10" : ""
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={1.5}
                    fill={active ? "currentColor" : "none"}
                  />
                  {showBadge && (
                    <span
                      aria-hidden="true"
                      className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-primary transition-all duration-200 active:scale-[0.98]"
                    />
                  )}
                </span>
                <span>{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
