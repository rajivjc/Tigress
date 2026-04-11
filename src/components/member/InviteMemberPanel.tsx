"use client";

// =============================================================================
// InviteMemberPanel
// =============================================================================
// Bottom-sheet modal opened from the booking detail page. Lets the booking
// owner search other members by name or email and send invites. Uses
// searchMembersAction (debounced) and createInviteAction under the hood.
// Already-invited members are shown with their status badge and can't be
// re-invited.
// =============================================================================

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInviteAction,
} from "@/app/actions/invites";
import { searchMembersAction } from "@/app/actions/members";
import type { MemberSearchResult } from "@/lib/data/members";
import type { BookingInviteStatus } from "@/lib/types";

export interface ExistingInviteInfo {
  invitee_id: string;
  full_name: string;
  status: BookingInviteStatus;
}

export interface InviteMemberPanelProps {
  bookingId: string;
  /** The booking owner — excluded from search results. */
  ownerMemberId: string;
  existingInvites: ExistingInviteInfo[];
  onClose: () => void;
}

const INVITE_STATUS_STYLES: Record<BookingInviteStatus, string> = {
  pending: "bg-white/10 text-white/60",
  accepted: "bg-emerald-500/15 text-emerald-300",
  declined: "bg-red-500/15 text-red-300",
};

export function InviteMemberPanel({
  bookingId,
  ownerMemberId,
  existingInvites,
  onClose,
}: InviteMemberPanelProps) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [pending, startTransition] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Keep a live set of already-invited ids so multiple sends during a single
  // panel session don't re-offer the same member.
  const [localInvitedIds, setLocalInvitedIds] = useState<string[]>(() =>
    existingInvites.map((i) => i.invitee_id)
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim();
    if (term.length === 0) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const excludeIds = Array.from(
        new Set([ownerMemberId, ...localInvitedIds])
      );
      const res = await searchMembersAction(term, excludeIds);
      if (res.error) {
        setSearchError(res.error);
        setResults([]);
      } else {
        setSearchError(null);
        setResults(res.members);
      }
      setSearching(false);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, ownerMemberId, localInvitedIds]);

  const handleInvite = (inviteeId: string) => {
    setInviteError(null);
    setSuccessId(null);
    startTransition(async () => {
      const res = await createInviteAction(bookingId, inviteeId);
      if (!res.success) {
        setInviteError(res.error ?? "Failed to send invite");
        return;
      }
      setSuccessId(inviteeId);
      setLocalInvitedIds((prev) => Array.from(new Set([...prev, inviteeId])));
      setResults((prev) => prev.filter((m) => m.id !== inviteeId));
      // Refresh server components so the invite list on the page updates.
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 md:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-t-2xl border border-white/10 bg-surface shadow-2xl md:rounded-2xl">
        <header className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-white/40">
              Invite members
            </p>
            <h2 className="text-base font-semibold text-white">
              Add to this session
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/5"
            aria-label="Close"
          >
            Close
          </button>
        </header>

        <div className="space-y-3 p-4">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
              Search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or email"
              autoFocus
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent"
            />
          </label>

          {searchError && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {searchError}
            </p>
          )}

          {inviteError && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {inviteError}
            </p>
          )}

          {successId && (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-300">
              Invite sent.
            </p>
          )}

          {/* Existing invites — always visible so the owner sees who has
              already been invited on this booking. */}
          {existingInvites.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
                Already invited
              </p>
              <ul className="space-y-1">
                {existingInvites.map((inv) => (
                  <li
                    key={inv.invitee_id}
                    className="flex items-center justify-between rounded-md border border-white/5 bg-black/20 px-3 py-2 text-sm"
                  >
                    <span className="truncate text-white/80">
                      {inv.full_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        INVITE_STATUS_STYLES[inv.status]
                      }`}
                    >
                      {inv.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Search results */}
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
              Results
            </p>

            {searching && (
              <p className="text-xs text-white/50">Searching…</p>
            )}

            {!searching && query.trim().length === 0 && (
              <p className="text-xs text-white/50">
                Start typing to find a member by name or email.
              </p>
            )}

            {!searching && query.trim().length > 0 && results.length === 0 && (
              <p className="text-xs text-white/50">No members found.</p>
            )}

            {!searching && results.length > 0 && (
              <ul className="space-y-1">
                {results.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 rounded-md border border-white/5 bg-black/20 p-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-white">{m.full_name}</div>
                      <div className="truncate text-[11px] text-white/50">
                        {m.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleInvite(m.id)}
                      disabled={pending}
                      className="shrink-0 rounded-md bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
                    >
                      {pending ? "…" : "Invite"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
