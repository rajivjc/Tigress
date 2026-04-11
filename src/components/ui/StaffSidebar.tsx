"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME } from "@/lib/constants";

const staffLinks = [
  { href: "/floor", label: "Floorplan" },
  { href: "/calendar", label: "Calendar" },
  { href: "/walk-in", label: "Walk-in" },
  { href: "/members", label: "Members" },
];

const ownerLinks = [
  { href: "/settings", label: "Settings" },
  { href: "/rates", label: "Rates" },
];

export function StaffSidebar() {
  const pathname = usePathname();

  const renderLink = (link: { href: string; label: string }) => {
    const active = pathname === link.href;
    return (
      <li key={link.href}>
        <Link
          href={link.href}
          className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
            active
              ? "bg-accent/20 text-accent"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          {link.label}
        </Link>
      </li>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 border-r border-white/10 bg-primary/60 p-4 md:block">
      <div className="mb-6 px-2">
        <h1 className="text-xl font-bold text-white">
          {APP_NAME}
          <span className="text-accent">.</span>
        </h1>
        <p className="text-xs text-white/40">Staff console</p>
      </div>

      <div className="mb-2 px-3 text-xs uppercase tracking-wider text-white/40">
        Operations
      </div>
      <ul className="mb-6 space-y-1">{staffLinks.map(renderLink)}</ul>

      <div className="mb-2 px-3 text-xs uppercase tracking-wider text-white/40">
        Owner
      </div>
      <ul className="space-y-1">{ownerLinks.map(renderLink)}</ul>
    </aside>
  );
}
