"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/owner/payroll/settings", label: "General" },
  { href: "/owner/payroll/settings/branding", label: "Branding" },
  { href: "/owner/payroll/settings/rates", label: "Rates" },
  { href: "/owner/payroll/settings/rate-rules", label: "Rate rules" },
  { href: "/owner/payroll/settings/overtime-rules", label: "Overtime" },
  { href: "/owner/payroll/settings/holidays", label: "Holidays" },
];

export function PayrollSettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-zinc-800 pb-2">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded px-3 py-1.5 text-sm ${
              active
                ? "bg-rose-500/20 text-rose-200"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
