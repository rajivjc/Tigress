"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home", icon: "◆" },
  { href: "/book", label: "Book", icon: "+" },
  { href: "/bookings", label: "Bookings", icon: "≡" },
  { href: "/profile", label: "Profile", icon: "●" },
];

export function MemberNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-primary/95 backdrop-blur-md">
      <ul className="mx-auto flex max-w-md items-center justify-around px-2 py-2">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-2 text-xs transition-colors ${
                  active
                    ? "text-accent"
                    : "text-white/60 hover:text-white"
                }`}
              >
                <span className="text-lg leading-none">{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
