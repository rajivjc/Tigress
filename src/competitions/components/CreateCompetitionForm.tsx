"use client";

// =============================================================================
// CreateCompetitionForm
// =============================================================================
// Owner-only form for drafting a competition. Uses radios for enum fields
// and a textarea for the raw team_match_config JSON (proper builder UI
// lands in S23). On submit → createCompetitionDraftAction, then redirects
// to the detail page.
// =============================================================================

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCompetitionDraftAction } from "@/competitions/actions/competitions";
import type {
  CompetitionEntrantType,
  CompetitionFormat,
  CompetitionGuestPolicy,
  CompetitionKind,
  GameType,
  TeamMatchConfig,
} from "../types";

export interface CreateCompetitionFormProps {
  gameTypes: GameType[];
}

const DEFAULT_LEAGUE_CONFIG_JSON = JSON.stringify(
  {
    slots: [
      { id: "singles_1", kind: "singles", race_to: 5, sort_order: 1 },
      { id: "singles_2", kind: "singles", race_to: 5, sort_order: 2 },
      { id: "doubles_1", kind: "doubles", race_to: 3, sort_order: 3 },
    ],
  },
  null,
  2
);

export function CreateCompetitionForm({
  gameTypes,
}: CreateCompetitionFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<CompetitionKind>("tournament");
  const [format, setFormat] = useState<CompetitionFormat>("single_elim");
  const [entrantType, setEntrantType] =
    useState<CompetitionEntrantType>("individual");
  const [gameTypeId, setGameTypeId] = useState<string>(
    gameTypes[0]?.id ?? ""
  );
  const [guestPolicy, setGuestPolicy] =
    useState<CompetitionGuestPolicy>("members_only");
  const [teamConfigJson, setTeamConfigJson] = useState<string>(
    DEFAULT_LEAGUE_CONFIG_JSON
  );
  const [regOpensAt, setRegOpensAt] = useState("");
  const [regClosesAt, setRegClosesAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  // League is team-only by constraint.
  useEffect(() => {
    if (kind === "league") setEntrantType("team");
  }, [kind]);

  const showFormat = kind === "tournament";
  const showTeamConfig = kind === "league" && entrantType === "team";

  const { parsedTeamConfig, teamConfigError } = useMemo(
    () => parseTeamConfig(teamConfigJson, showTeamConfig),
    [teamConfigJson, showTeamConfig]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (showTeamConfig && teamConfigError) {
      setError(teamConfigError);
      return;
    }

    startTransition(async () => {
      const result = await createCompetitionDraftAction({
        name,
        description: description.trim() ? description.trim() : null,
        kind,
        format: showFormat ? format : null,
        entrant_type: entrantType,
        game_type_id: gameTypeId,
        guest_policy: guestPolicy,
        team_match_config: showTeamConfig ? parsedTeamConfig : null,
        registration_opens_at: regOpensAt || null,
        registration_closes_at: regClosesAt || null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
      });

      if (!result.success || !result.id) {
        setError(result.error ?? "Failed to create competition");
        return;
      }
      router.push(`/competitions/${result.id}`);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-white/10 bg-surface-1/70 p-4">
      <Field label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          placeholder="Spring 9-Ball Open"
        />
      </Field>

      <Field label="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          placeholder="One-liner about the competition"
        />
      </Field>

      <Field label="Kind">
        <RadioGroup
          value={kind}
          options={[
            { value: "tournament", label: "Tournament" },
            { value: "league", label: "League" },
            { value: "ladder", label: "Ladder" },
            { value: "casual", label: "Casual" },
          ]}
          onChange={(v) => setKind(v as CompetitionKind)}
        />
      </Field>

      {showFormat && (
        <Field label="Tournament format">
          <RadioGroup
            value={format}
            options={[
              { value: "single_elim", label: "Single elim" },
              { value: "double_elim", label: "Double elim" },
              { value: "round_robin", label: "Round robin" },
              { value: "swiss", label: "Swiss" },
            ]}
            onChange={(v) => setFormat(v as CompetitionFormat)}
          />
        </Field>
      )}

      <Field label="Entrant type">
        <RadioGroup
          value={entrantType}
          options={[
            { value: "individual", label: "Individual" },
            { value: "team", label: "Team" },
          ]}
          onChange={(v) => setEntrantType(v as CompetitionEntrantType)}
          disabled={kind === "league"}
        />
        {kind === "league" && (
          <p className="mt-1 text-[11px] text-white/40">
            Leagues are team-based by definition.
          </p>
        )}
      </Field>

      <Field label="Game type">
        <select
          value={gameTypeId}
          onChange={(e) => setGameTypeId(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          required
        >
          {gameTypes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.display_name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Guest policy">
        <RadioGroup
          value={guestPolicy}
          options={[
            { value: "members_only", label: "Members only" },
            { value: "invited_guests", label: "Invited guests" },
            { value: "paying_guests", label: "Paying guests" },
            { value: "both_guest_types", label: "Both guest types" },
          ]}
          onChange={(v) => setGuestPolicy(v as CompetitionGuestPolicy)}
        />
      </Field>

      {showTeamConfig && (
        <Field label="Team match config (JSON)">
          <textarea
            value={teamConfigJson}
            onChange={(e) => setTeamConfigJson(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 font-mono text-[11px] text-white focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
          />
          {teamConfigError ? (
            <p className="mt-1 text-[11px] text-rose-300">{teamConfigError}</p>
          ) : (
            <p className="mt-1 text-[11px] text-white/40">
              Defines the sub-matches that make up one team-vs-team night. A
              proper builder UI arrives in a future session.
            </p>
          )}
        </Field>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Registration opens (optional)">
          <DateTimeInput value={regOpensAt} onChange={setRegOpensAt} />
        </Field>
        <Field label="Registration closes (optional)">
          <DateTimeInput value={regClosesAt} onChange={setRegClosesAt} />
        </Field>
        <Field label="Starts at (optional)">
          <DateTimeInput value={startsAt} onChange={setStartsAt} />
        </Field>
        <Field label="Ends at (optional)">
          <DateTimeInput value={endsAt} onChange={setEndsAt} />
        </Field>
      </div>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}

// ---------- Sub-components ----------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}

function RadioGroup({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            disabled={disabled}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-accent bg-accent/15 text-white"
                : "border-white/10 text-white/70 hover:bg-white/5"
            } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function DateTimeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="datetime-local"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white focus:border-accent focus:ring-2 focus:ring-accent/30 focus:outline-none"
    />
  );
}

// ---------- Helpers ----------

function parseTeamConfig(
  raw: string,
  required: boolean
): { parsedTeamConfig: TeamMatchConfig | null; teamConfigError: string | null } {
  if (!required) return { parsedTeamConfig: null, teamConfigError: null };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("slots" in parsed) ||
      !Array.isArray((parsed as { slots: unknown }).slots)
    ) {
      return {
        parsedTeamConfig: null,
        teamConfigError: "Must be an object with a `slots` array.",
      };
    }
    // Trust the shape past this point — S23 will add a proper schema check.
    return {
      parsedTeamConfig: parsed as TeamMatchConfig,
      teamConfigError: null,
    };
  } catch (err) {
    return {
      parsedTeamConfig: null,
      teamConfigError:
        err instanceof Error ? err.message : "Invalid JSON",
    };
  }
}
