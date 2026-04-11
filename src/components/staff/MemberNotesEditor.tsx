"use client";

// =============================================================================
// MemberNotesEditor
// =============================================================================
// Manager/owner-only inline editor for the staff `notes` field on a member.
// Other staff see the read-only text via MemberNotesView below.
// =============================================================================

import { useState, useTransition } from "react";
import { updateMemberNotesAction } from "@/app/actions/members";

export interface MemberNotesEditorProps {
  memberId: string;
  initialNotes: string | null;
}

export function MemberNotesEditor({
  memberId,
  initialNotes,
}: MemberNotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const res = await updateMemberNotesAction(memberId, notes);
      if (!res.success) {
        setError(res.error ?? "Failed to save notes");
        return;
      }
      setSavedAt(Date.now());
    });
  };

  return (
    <div className="space-y-2">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="Internal notes about this member…"
        className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/5 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save notes"}
        </button>
        {error && <p className="text-xs text-red-300">{error}</p>}
        {!error && savedAt && (
          <p className="text-xs text-white/40">Saved</p>
        )}
      </div>
    </div>
  );
}

export function MemberNotesView({ notes }: { notes: string | null }) {
  if (!notes) {
    return <p className="text-sm text-white/40">No notes.</p>;
  }
  return (
    <p className="whitespace-pre-wrap text-sm text-white/80">{notes}</p>
  );
}
