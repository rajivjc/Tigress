"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Calendar,
  ClipboardCheck,
  BookOpen,
  History,
  ListChecks,
  MessageCircle,
  UserPlus,
  Users,
  Settings,
  DollarSign,
  type LucideIcon,
} from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useAuth } from "@/hooks/useAuth";

type SidebarLink = { href: string; label: string; icon: LucideIcon };

const staffLinks: SidebarLink[] = [
  { href: "/floor", label: "Floorplan", icon: LayoutGrid },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/checklists", label: "Checklists", icon: ClipboardCheck },
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/feed", label: "Feed", icon: MessageCircle },
  { href: "/walk-in", label: "Walk-in", icon: UserPlus },
  { href: "/members", label: "Members", icon: Users },
];

const managerLinks: SidebarLink[] = [
  { href: "/checklists/templates", label: "Templates", icon: ListChecks },
  { href: "/checklists/history", label: "Checklist history", icon: History },
];

const ownerLinks: SidebarLink[] = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/rates", label: "Rates", icon: DollarSign },
];

export function StaffSidebar() {
  const pathname = usePathname();
  const { profile, role } = useAuth();

  const renderLink = (link: SidebarLink) => {
    const active = pathname === link.href;
    const Icon = link.icon;
    return (
      <li key={link.href}>
        <Link
          href={link.href}
          className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm transition-colors ${
            active
              ? "border-l-accent bg-surface-3 text-accent"
              : "border-l-transparent text-white/70 hover:bg-surface-2 hover:text-white"
          }`}
        >
          <Icon
            size={18}
            strokeWidth={1.5}
            fill={active ? "currentColor" : "none"}
          />
          <span>{link.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-white/10 bg-primary/60 p-4 md:flex">
      <div className="mb-6 px-2">
        <h1 className="text-xl font-extrabold text-white">
          {APP_NAME}
          <span className="text-accent">.</span>
        </h1>
        <p className="text-xs text-white/40">Staff console</p>
      </div>

      <div className="mb-2 px-3 text-xs uppercase tracking-wider text-white/40">
        Operations
      </div>
      <ul className="mb-6 space-y-1">{staffLinks.map(renderLink)}</ul>

      {(role === "manager" || role === "owner") && (
        <>
          <div className="mb-2 px-3 text-xs uppercase tracking-wider text-white/40">
            Manager
          </div>
          <ul className="mb-6 space-y-1">{managerLinks.map(renderLink)}</ul>
        </>
      )}

      {role === "owner" && (
        <>
          <div className="mb-2 px-3 text-xs uppercase tracking-wider text-white/40">
            Owner
          </div>
          <ul className="space-y-1">{ownerLinks.map(renderLink)}</ul>
        </>
      )}

      <div className="mt-auto border-t border-white/10 pt-4">
        {profile && (
          <div className="mb-3 px-3 text-xs text-white/60">
            <div className="truncate text-white">{profile.full_name}</div>
            <div className="truncate text-white/40">{role}</div>
          </div>
        )}
        <LogoutButton variant="sidebar" />
      </div>
    </aside>
  );
}
