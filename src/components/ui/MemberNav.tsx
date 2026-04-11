"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home", icon: "◆" },
  { href: "/book", label: "Book", icon: "+" },
  { href: "/bookings", label: "Bookings", icon: "≡" },
  { href: "/profile", label: "Profile", icon: "●" },
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary/95 backdrop-blur-md">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {links.map((link) => {
          const active = pathname === link.href;
          const showBadge = hasInvites && link.href === "/dashboard";
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                  active
                    ? "text-accent"
                    : "text-white/60 hover:text-white"
                }`}
                aria-label={
                  showBadge
                    ? `${link.label} — ${pendingInviteCount} pending invite${
                        pendingInviteCount === 1 ? "" : "s"
                      }`
                    : link.label
                }
              >
                <span className="relative text-lg leading-none">
                  {link.icon}
                  {showBadge && (
                    <span
                      aria-hidden="true"
                      className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-primary"
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
