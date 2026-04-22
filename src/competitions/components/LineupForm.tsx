"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLineupAction } from "../actions/lineups";
import type { LineupSide } from "../types";

export interface LineupFormProps {
  matchId: string;
  side: LineupSide;
  slotKind: "singles" | "doubles";
  roster: { id: string; displayName: string }[];
  initialMemberIds: string[];
}

export function LineupForm({
  matchId,
  side,
  slotKind,
  roster,
  initialMemberIds,
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

  return (
    <form onSubmit={submit} className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-white/40">
        Pick {requiredCount} ({slotKind})
      </p>
      <ul className="space-y-1">
        {roster.map((m) => {
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
        })}
      </ul>
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
