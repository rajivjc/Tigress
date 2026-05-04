"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLineupAction } from "../actions/lineups";
import type { LeagueLineupRule, LineupSide } from "../types";

export interface LineupFormProps {
  matchId: string;
  side: LineupSide;
  slotKind: "singles" | "doubles";
  /** Roster members for THIS team. Always shown. */
  roster: { id: string; displayName: string }[];
  initialMemberIds: string[];
  /** S24b1: defaults to 'strict' for backwards compatibility — caller should
   *  pass the league config's `lineup.rule` so the picker matches. */
  lineupRule?: LeagueLineupRule;
  /** S24b1: non-roster active members to include in the picker. Used by
   *  `loose` (mixed alongside roster) and `sub_with_approval` (rendered as
   *  a "Substitutes" group with an approval-warning). Ignored under
   *  `strict`. */
  subEligible?: { id: string; displayName: string }[];
}

export function LineupForm({
  matchId,
  side,
  slotKind,
  roster,
  initialMemberIds,
  lineupRule = "strict",
  subEligible = [],
}: LineupFormProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const requiredCount = slotKind === "singles" ? 1 : 2;
  const [selected, setSelected] = useState<string[]>(initialMemberIds);

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= requiredCount) return cur;
      return [...cur, id];
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length !== requiredCount) return;
    startTransition(async () => {
      const res = await setLineupAction({
        matchId,
        side,
        memberIds: selected,
        slotKind,
      });
      if (!res.success) {
        alert(res.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  };

  // Compute the picker contents. Under `loose` the substitutes are mixed
  // into the main list (no roster distinction matters). Under
  // `sub_with_approval` we render two groups so the warning banner only
  // appears when a non-roster sub is actually selected.
  const rosterIds = new Set(roster.map((m) => m.id));
  const subsOnly = subEligible.filter((m) => !rosterIds.has(m.id));
  const showSubs =
    (lineupRule === "loose" || lineupRule === "sub_with_approval") &&
    subsOnly.length > 0;
  const selectedSubCount = selected.filter((id) =>
    subsOnly.some((s) => s.id === id)
  ).length;
  const warnApproval =
    lineupRule === "sub_with_approval" && selectedSubCount > 0;

  const renderRow = (m: { id: string; displayName: string }) => {
    const checked = selected.includes(m.id);
    return (
      <li key={m.id}>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white/80 hover:bg-surface-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => toggle(m.id)}
          />
          {m.displayName}
        </label>
      </li>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-white/40">
        Pick {requiredCount} ({slotKind})
      </p>
      {lineupRule === "loose" ? (
        <ul className="space-y-1">
          {[...roster, ...subsOnly]
            .sort((a, b) => a.displayName.localeCompare(b.displayName))
            .map(renderRow)}
        </ul>
      ) : (
        <>
          <ul className="space-y-1">{roster.map(renderRow)}</ul>
          {showSubs && (
            <>
              <p className="pt-2 text-[10px] uppercase tracking-wider text-white/40">
                Substitutes
              </p>
              <ul className="space-y-1">{subsOnly.map(renderRow)}</ul>
            </>
          )}
        </>
      )}
      {warnApproval && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          This player isn&apos;t on the roster — opposing captain must approve
          before play.
        </p>
      )}
      <button
        type="submit"
        disabled={pending || selected.length !== requiredCount}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save lineup"}
      </button>
    </form>
  );
}
