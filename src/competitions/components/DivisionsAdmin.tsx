"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDivisionAction,
  deleteDivisionAction,
} from "../actions/divisions";
import type { Division, Season } from "../types";

export function DivisionsAdmin({
  seasons,
  divisions,
}: {
  seasons: Season[];
  divisions: Division[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const defaultSeason = seasons[0]?.id ?? "";
  const [seasonId, setSeasonId] = useState(defaultSeason);
  const [leagueName, setLeagueName] = useState("");
  const [tier, setTier] = useState<number>(1);
  const [tierName, setTierName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createDivisionAction({
        season_id: seasonId,
        league_name: leagueName,
        tier,
        tier_name: tierName,
      });
      if (!res.success) {
        alert(res.error ?? "Failed");
        return;
      }
      setLeagueName("");
      setTierName("");
      setTier(1);
      router.refresh();
    });
  };

  const del = (id: string) => {
    if (
      !window.confirm(
        "Delete this division? Only allowed if no competition references it."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteDivisionAction(id);
      if (!res.success) alert(res.error ?? "Failed");
      router.refresh();
    });
  };

  const seasonMap = new Map(seasons.map((s) => [s.id, s]));

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="space-y-3 rounded-xl border border-white/10 bg-surface-1/70 p-4"
      >
        <p className="text-[10px] uppercase tracking-wider text-white/40">
          New division
        </p>
        <select
          value={seasonId}
          onChange={(e) => setSeasonId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white"
          required
        >
          <option value="">Select season…</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.status})
            </option>
          ))}
        </select>
        <input
          value={leagueName}
          onChange={(e) => setLeagueName(e.target.value)}
          placeholder="League name (e.g. Wednesday Night)"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white"
          required
        />
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={10}
            value={tier}
            onChange={(e) => setTier(parseInt(e.target.value, 10) || 1)}
            className="w-20 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white"
            required
          />
          <input
            value={tierName}
            onChange={(e) => setTierName(e.target.value)}
            placeholder="Tier name (e.g. Premier)"
            className="flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white"
            required
          />
        </div>
        <button
          type="submit"
          disabled={pending || !seasonId}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create division
        </button>
      </form>

      <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
        {divisions.map((d) => (
          <li key={d.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">
                {d.league_name} · {d.tier_name} (tier {d.tier})
              </p>
              <p className="mt-0.5 text-[11px] text-white/50">
                {seasonMap.get(d.season_id)?.name ?? "—"}
              </p>
            </div>
            <button
              onClick={() => del(d.id)}
              disabled={pending}
              className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-surface-2"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
