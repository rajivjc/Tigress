"use client";

// =============================================================================
// InviteMemberButton
// =============================================================================
// Client-side trigger for the InviteMemberPanel. Rendered next to the
// "Invited members" header on /bookings/[id] when the booking owner is
// viewing their own upcoming booking.
// =============================================================================

import { useState } from "react";
import {
  InviteMemberPanel,
  type ExistingInviteInfo,
} from "./InviteMemberPanel";

export interface InviteMemberButtonProps {
  bookingId: string;
  ownerMemberId: string;
  existingInvites: ExistingInviteInfo[];
}

export function InviteMemberButton({
  bookingId,
  ownerMemberId,
  existingInvites,
}: InviteMemberButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent hover:bg-accent/20 transition-all duration-200 active:scale-[0.98]"
      >
        Invite a member
      </button>

      {open && (
        <InviteMemberPanel
          bookingId={bookingId}
          ownerMemberId={ownerMemberId}
          existingInvites={existingInvites}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
