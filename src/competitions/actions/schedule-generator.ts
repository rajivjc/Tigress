"use server";

// =============================================================================
// Competitions — round-robin schedule generator action (Session 24a)
// =============================================================================
// Wraps the pure `generateRoundRobin` generator with persistence + guards.
// Manager+ only. Three modes:
//
//   empty       — refuse if the division already has any fixtures
//   append      — generate from currently registered teams and insert
//   regenerate  — wipe existing fixtures (requires confirmRegenerate=true)
//                 and refuse if any sub-match has a recorded result
//
// Resolves (seasonId, divisionId) → the league competition for that division.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentActor } from "../data/players";
import { listEntrants } from "../data/entrants";
import {
  bulkCreateFixtures,
  countFixturesByCompetition,
  deleteFixturesByCompetition,
  listFixtures,
} from "../data/fixtures";
import {
  generateRoundRobin,
  type GeneratedFixture,
  type ScheduleCadence,
} from "../lib/schedule";
import { writeCompAuditLog } from "../audit";
import { MOCK_COMP_COMPETITIONS } from "../data/mock-data";
import type { Competition } from "../types";

export type GeneratorMode = "empty" | "append" | "regenerate";

export type GenerateSeasonFixturesInput = {
  /**
   * Season ID. Currently informational — the generator resolves the league
   * competition via `divisionId` alone, since each division belongs to a
   * single season (`comp_divisions.season_id` is FK-unique). Carried in the
   * input for symmetry with other action signatures and audited in the
   * event payload.
   */
  seasonId: string;
  divisionId: string;
  mode: GeneratorMode;
  rounds: 1 | 2;
  /**
   * Cadence + start date are honoured for `empty` and `regenerate` modes.
   * They are **ignored** in `append` mode — appended pairings are ad-hoc
   * additions for late-joining teams and don't participate in the cadence-
   * driven rollout. The caller's UI should surface this.
   */
  startDate?: string;
  cadence?: ScheduleCadence;
  /** Required when mode === 'regenerate'. */
  confirmRegenerate?: boolean;
};

export type GenerateSeasonFixturesResult =
  | { success: true; generated: number; wiped?: number }
  | { success: false; error: string };

async function findLeagueCompetition(
  divisionId: string
): Promise<Competition | null> {
  if (!isSupabaseConfigured()) {
    return (
      MOCK_COMP_COMPETITIONS.find(
        (c) => c.division_id === divisionId && c.kind === "league"
      ) ?? null
    );
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_competitions")
    .select("*")
    .eq("division_id", divisionId)
    .eq("kind", "league")
    .order("created_at", { ascending: false });
  const list = (data as Competition[] | null) ?? [];
  return list[0] ?? null;
}

export async function generateSeasonFixtures(
  input: GenerateSeasonFixturesInput
): Promise<GenerateSeasonFixturesResult> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const competition = await findLeagueCompetition(input.divisionId);
  if (!competition) {
    return { success: false, error: "No league competition for this division" };
  }

  if (input.mode === "regenerate" && !input.confirmRegenerate) {
    return { success: false, error: "CONFIRM_REQUIRED" };
  }
  if (input.mode === "empty") {
    const existing = await countFixturesByCompetition(competition.id);
    if (existing > 0) {
      return { success: false, error: "SEASON_NOT_EMPTY" };
    }
  }

  // Resolve entrants → team ids. Drop withdrawn entrants and entrants without
  // a team (guests / individual members shouldn't appear in a league but the
  // filter is defensive).
  const entrants = await listEntrants(competition.id);
  const activeTeamEntrants = entrants.filter(
    (e) => e.status === "active" && e.entrant_team_id !== null
  );
  if (activeTeamEntrants.length < 2) {
    return { success: false, error: "Need at least 2 active team entrants" };
  }
  const teamIdToEntrantId = new Map<string, string>();
  const entrantIdToTeamId = new Map<string, string>();
  for (const e of activeTeamEntrants) {
    teamIdToEntrantId.set(e.entrant_team_id!, e.id);
    entrantIdToTeamId.set(e.id, e.entrant_team_id!);
  }
  const teamIds = activeTeamEntrants.map((e) => e.entrant_team_id!);

  let wiped = 0;
  if (input.mode === "regenerate") {
    const del = await deleteFixturesByCompetition(competition.id, {
      onlyIfNoResults: true,
    });
    if (!del.success) {
      return { success: false, error: del.error ?? "Delete failed" };
    }
    wiped = del.deleted ?? 0;
  }

  let generated: GeneratedFixture[];
  try {
    generated = generateRoundRobin({
      teamIds,
      rounds: input.rounds,
      // Append mode never date-stamps — appended fixtures are ad-hoc and
      // don't participate in cadence-driven rollout.
      startDate: input.mode === "append" ? undefined : input.startDate,
      cadence: input.mode === "append" ? undefined : input.cadence,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Generator failed",
    };
  }

  // Append: keep only pairings that don't already have an existing fixture,
  // drop bye rows entirely (a late team can't retroactively introduce byes
  // into already-played rounds), and assign new round numbers continuing
  // past the existing max.
  if (input.mode === "append") {
    const existing = await listFixtures({ competitionId: competition.id });

    const existingPairCounts = new Map<string, number>();
    let maxExistingRound = 0;
    for (const fx of existing) {
      if (fx.round_number !== null && fx.round_number > maxExistingRound) {
        maxExistingRound = fx.round_number;
      }
      if (fx.is_bye) continue;
      if (fx.home_entrant_id === null || fx.away_entrant_id === null) continue;
      const homeTeam = entrantIdToTeamId.get(fx.home_entrant_id);
      const awayTeam = entrantIdToTeamId.get(fx.away_entrant_id);
      if (!homeTeam || !awayTeam) continue;
      const key = pairKey(homeTeam, awayTeam);
      existingPairCounts.set(key, (existingPairCounts.get(key) ?? 0) + 1);
    }

    const remaining = new Map(existingPairCounts);
    const survivors: GeneratedFixture[] = [];
    for (const g of generated) {
      if (g.isBye) continue;
      if (g.homeTeamId === null || g.awayTeamId === null) continue;
      const key = pairKey(g.homeTeamId, g.awayTeamId);
      const remainingCount = remaining.get(key) ?? 0;
      if (remainingCount > 0) {
        // Pair already represented in existing fixtures — consume one
        // instance so a `rounds: 2` request that's missing the second
        // mirror still surfaces it as a surviving pair.
        remaining.set(key, remainingCount - 1);
        continue;
      }
      survivors.push(g);
    }

    let nextRound = maxExistingRound + 1;
    generated = survivors.map((g) => ({
      ...g,
      roundNumber: nextRound++,
      scheduledAt: null,
    }));
  }

  if (generated.length === 0 && input.mode === "append") {
    await writeCompAuditLog(
      "comp.season.fixtures_generated",
      competition.id,
      actor.player.id,
      {
        seasonId: input.seasonId,
        divisionId: input.divisionId,
        competitionId: competition.id,
        mode: input.mode,
        rounds: input.rounds,
        generated: 0,
        appended: 0,
      }
    );
    revalidatePath(`/competitions/${competition.id}`);
    revalidatePath("/leagues");
    revalidatePath("/leagues/seasons");
    revalidatePath("/leagues/divisions");
    return { success: true, generated: 0 };
  }

  const rows = generated.map((g) => ({
    generated: g,
    homeEntrantId:
      g.homeTeamId !== null ? teamIdToEntrantId.get(g.homeTeamId) ?? null : null,
    awayEntrantId:
      g.awayTeamId !== null ? teamIdToEntrantId.get(g.awayTeamId) ?? null : null,
    byeEntrantId:
      g.byeTeamId !== null ? teamIdToEntrantId.get(g.byeTeamId) ?? null : null,
  }));

  const insert = await bulkCreateFixtures(competition.id, rows);
  if (!insert.success) {
    return { success: false, error: insert.error ?? "Insert failed" };
  }
  const insertedCount = insert.rows?.length ?? 0;

  await writeCompAuditLog(
    input.mode === "regenerate"
      ? "comp.season.fixtures_regenerated"
      : "comp.season.fixtures_generated",
    competition.id,
    actor.player.id,
    {
      seasonId: input.seasonId,
      divisionId: input.divisionId,
      competitionId: competition.id,
      mode: input.mode,
      rounds: input.rounds,
      generated: insertedCount,
      wiped: input.mode === "regenerate" ? wiped : undefined,
      appended: input.mode === "append" ? insertedCount : undefined,
    }
  );

  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath("/leagues");
  revalidatePath("/leagues/seasons");
  revalidatePath("/leagues/divisions");

  return input.mode === "regenerate"
    ? { success: true, generated: insertedCount, wiped }
    : { success: true, generated: insertedCount };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}
