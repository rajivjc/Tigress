"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  archiveSeasonAction,
  createSeasonAction,
  updateSeasonStatusAction,
} from "../actions/seasons";
import { setNextSeasonAction } from "../actions/promotion";
import type { Season, SeasonStatus } from "../types";

export function SeasonsAdmin({ seasons }: { seasons: Season[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startsAt) return;
    startTransition(async () => {
      const res = await createSeasonAction({
        name,
        starts_at: new Date(startsAt).toISOString(),
        ends_at: null,
      });
      if (!res.success) {
        alert(res.error ?? "Failed");
        return;
      }
      setName("");
      setStartsAt("");
      router.refresh();
    });
  };

  const changeStatus = (id: string, status: SeasonStatus) => {
    startTransition(async () => {
      const res = await updateSeasonStatusAction(id, status);
      if (!res.success) alert(res.error ?? "Failed");
      router.refresh();
    });
  };

  const archive = (id: string) => {
    if (!window.confirm("Archive this season? Its leagues remain readable.")) return;
    startTransition(async () => {
      const res = await archiveSeasonAction(id);
      if (!res.success) alert(res.error ?? "Failed");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={submit}
        className="space-y-3 rounded-xl border border-white/10 bg-surface-1/70 p-4"
      >
        <p className="text-[10px] uppercase tracking-wider text-white/40">
          New season
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Season name (e.g. Fall 2026)"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white"
          required
        />
        <input
          type="date"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create season
        </button>
      </form>

      <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-surface-1/70">
        {seasons.map((s) => (
          <li key={s.id} className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{s.name}</p>
                <p className="mt-0.5 text-[11px] text-white/50">
                  Starts {new Date(s.starts_at).toLocaleDateString()}
                </p>
              </div>
              <span className="rounded-full border border-white/15 bg-surface-2/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
                {s.status}
              </span>
            </div>
            <div className="flex gap-2 text-[11px]">
              {s.status === "planned" && (
                <button
                  onClick={() => changeStatus(s.id, "active")}
                  disabled={pending}
                  className="rounded border border-white/10 px-2 py-1 text-white/80 hover:bg-surface-2"
                >
                  Activate
                </button>
              )}
              {s.status === "active" && (
                <button
                  onClick={() => changeStatus(s.id, "completed")}
                  disabled={pending}
                  className="rounded border border-white/10 px-2 py-1 text-white/80 hover:bg-surface-2"
                >
                  Complete
                </button>
              )}
              {s.status !== "archived" && (
                <button
                  onClick={() => archive(s.id)}
                  disabled={pending}
                  className="rounded border border-white/10 px-2 py-1 text-white/60 hover:bg-surface-2"
                >
                  Archive
                </button>
              )}
            </div>
            <NextSeasonPicker season={s} allSeasons={seasons} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NextSeasonPicker({
  season,
  allSeasons,
}: {
  season: Season;
  allSeasons: Season[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(season.next_season_id ?? "");
  const [pending, startTransition] = useTransition();

  const candidates = allSeasons.filter(
    (s) => s.id !== season.id && s.starts_at >= season.starts_at
  );

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await setNextSeasonAction(season.id, value === "" ? null : value);
      if (!res.success) {
        alert(res.error ?? "Failed");
        return;
      }
      router.refresh();
    });
  };

  return (
    <form onSubmit={save} className="flex items-end gap-2 text-[11px] text-white/60">
      <label className="flex flex-col gap-0.5">
        <span className="uppercase tracking-wider text-white/40">Next season</span>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded border border-white/10 bg-surface-2 px-2 py-1 text-white"
        >
          <option value="">— none —</option>
          {candidates.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-white/10 px-2 py-1 text-white/80 hover:bg-surface-2 disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
