"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Calendar,
  CalendarRange,
  ClipboardCheck,
  BookOpen,
  MessageCircle,
  Trophy,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

const links: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/floor", label: "Floor", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/staff/schedule", label: "Shifts", icon: CalendarRange },
  { href: "/checklists", label: "Checks", icon: ClipboardCheck },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/competitions", label: "Compete", icon: Trophy },
  { href: "/feed", label: "Feed", icon: MessageCircle },
  { href: "/walk-in", label: "Walk-in", icon: UserPlus },
  { href: "/members", label: "Members", icon: Users },
];

export function StaffMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 py-3">
        {links.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex flex-col items-center gap-1 text-xs transition-colors ${
                  active ? "text-accent" : "text-white/50 hover:text-white"
                }`}
              >
                <span
                  className={`flex items-center justify-center rounded-xl px-3 py-1.5 transition-colors ${
                    active ? "bg-accent/10" : ""
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={1.5}
                    fill={active ? "currentColor" : "none"}
                  />
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
