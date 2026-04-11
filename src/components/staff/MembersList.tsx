"use client";

// =============================================================================
// MembersList
// =============================================================================
// Client list with a debounced search box. Filters the prefetched member list
// in-memory; for very large venues this could be promoted to a server-side
// search later, but the membership table here is small.
// =============================================================================

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import type { MemberListItem } from "@/lib/data/members";

export interface MembersListProps {
  initialMembers: MemberListItem[];
}

export function MembersList({ initialMembers }: MembersListProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initialMembers;
    return initialMembers.filter(({ member }) =>
      `${member.full_name} ${member.email}`.toLowerCase().includes(term)
    );
  }, [initialMembers, search]);

  return (
    <div className="space-y-4 p-4">
      <header>
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Membership
        </p>
        <h1 className="text-xl font-bold text-white">Members</h1>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email…"
        className="w-full rounded-lg border border-white/10 bg-surface/60 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30"
      />

      {filtered.length === 0 && (
        <p className="rounded-lg border border-white/10 bg-surface/40 p-4 text-center text-sm text-white/50">
          No members found.
        </p>
      )}

      <ul className="space-y-2">
        {filtered.map(({ member, tier }) => (
          <li key={member.id}>
            <Link
              href={`/members/${member.id}`}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface/60 p-3 transition-colors hover:bg-white/5"
            >
              <Avatar name={member.full_name} src={member.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {member.full_name}
                </p>
                <p className="truncate text-xs text-white/50">
                  {member.email}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {tier && (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                    {tier.name}
                  </span>
                )}
                <StatusDot
                  status={member.subscription_status}
                  showLabel={false}
                />
                <span className="text-[10px] text-white/40">
                  {member.credits_remaining} credit
                  {member.credits_remaining === 1 ? "" : "s"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
