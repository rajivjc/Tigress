"use server";

// =============================================================================
// Competitions — promotion/relegation server actions (Session 24b2)
// =============================================================================
// Manager/owner-driven season-end finalize. Loads the division's standings,
// runs them through the pure planner, validates the pre-conditions
// (fixtures complete, no replay-required pending, next season set, target
// divisions exist), and persists the decisions atomically via the
// comp_finalize_division_promotions RPC.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import { getDivision, findDivisionsByTiers } from "../data/divisions";
import { getSeason, setNextSeasonId } from "../data/seasons";
import { listCompetitions } from "../data/competitions";
import { listFixtures } from "../data/fixtures";
import {
  findReplayRequiredItems,
  getCompetitionStandings,
  type ReplayRequiredItem,
} from "../data/league-standings";
import { getFixturesEnriched } from "../data/fixtures";
import { listPairingsByFixtureIds } from "../data/fixture-pairings";
import { listEntrants } from "../data/entrants";
import {
  finalizeDivisionPromotions,
  type PromotionDecisionInsert,
} from "../data/promotions";
import {
  planPromotions,
  PromotionPlannerError,
  type PlannerEntrant,
  type PlannerOverride,
} from "../lib/promotion-planner";
import { writeCompAuditLog } from "../audit";
import type { Competition, Fixture, LeagueConfig } from "../types";
import type {
  StandingsFixtureInput,
  StandingsPairingInput,
  StandingsRow,
  StandingsSubMatchInput,
} from "../lib/standings";

export interface FinalizePromotionsOverride {
  entrantId: string;
  decision: "promote" | "relegate" | "stay";
  note: string;
}

export interface FinalizePromotionsInput {
  divisionId: string;
  /** Manual overrides for boundary ties or judgment calls. Each must carry
   *  a non-empty note. */
  overrides?: FinalizePromotionsOverride[];
  /** Required confirmation that the manager has reviewed the standings.
   *  Defense-in-depth alongside the UI confirm. */
  confirm: boolean;
}

export type FinalizePromotionsResult =
  | {
      success: true;
      promoted: number;
      relegated: number;
      stayed: number;
    }
  | {
      success: false;
      error: string;
      ties?: { position: number; entrantIds: string[] };
      missingTargets?: { tier: number; leagueName: string }[];
      incompleteFixtureIds?: string[];
      replayRequired?: ReplayRequiredItem[];
      /** Set when error === "OVERRIDE_NOTE_REQUIRED": the entrantId whose
       *  override is missing a note. */
      overrideNoteMissingFor?: string;
    };

const ERR_NOT_SIGNED_IN = "NOT_SIGNED_IN";
const ERR_UNAUTHORIZED = "UNAUTHORIZED";
const ERR_CONFIRM_REQUIRED = "CONFIRM_REQUIRED";
const ERR_DIVISION_NOT_FOUND = "DIVISION_NOT_FOUND";
const ERR_ALREADY_FINALIZED = "ALREADY_FINALIZED";
const ERR_SEASON_NOT_FOUND = "SEASON_NOT_FOUND";
const ERR_COMPETITION_NOT_FOUND = "COMPETITION_NOT_FOUND";
const ERR_FIXTURES_INCOMPLETE = "FIXTURES_INCOMPLETE";
const ERR_REPLAY_REQUIRED_PENDING = "REPLAY_REQUIRED_PENDING";
const ERR_NEXT_SEASON_NOT_SET_UP = "NEXT_SEASON_NOT_SET_UP";
const ERR_TARGET_DIVISIONS_MISSING = "TARGET_DIVISIONS_MISSING";
const ERR_OVERRIDE_NOTE_REQUIRED = "OVERRIDE_NOTE_REQUIRED";

/**
 * Two consecutive standings rows are "tied for real" when their points and
 * every per-row tiebreaker scalar are equal. The standings sort otherwise
 * falls through alphabetically on entrant id — which is fine for stable
 * order but not what the manager wants when the tied pair straddles a
 * promotion or relegation boundary. The planner uses this signal to
 * demand manual overrides.
 */
function rowsAreTied(a: StandingsRow, b: StandingsRow): boolean {
  return (
    a.points === b.points &&
    a.won === b.won &&
    a.drawn === b.drawn &&
    a.lost === b.lost &&
    a.subMatchesWon === b.subMatchesWon &&
    a.subMatchesLost === b.subMatchesLost &&
    a.subMatchDiff === b.subMatchDiff &&
    a.framesWon === b.framesWon &&
    a.framesLost === b.framesLost &&
    a.frameDiff === b.frameDiff &&
    a.awayWins === b.awayWins
  );
}

export async function finalizeDivisionPromotionsAction(
  input: FinalizePromotionsInput
): Promise<FinalizePromotionsResult> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: ERR_NOT_SIGNED_IN };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: ERR_UNAUTHORIZED };
  }
  if (input.confirm !== true) {
    return { success: false, error: ERR_CONFIRM_REQUIRED };
  }

  const division = await getDivision(input.divisionId);
  if (!division) return { success: false, error: ERR_DIVISION_NOT_FOUND };
  if (division.promotions_finalized_at !== null) {
    return { success: false, error: ERR_ALREADY_FINALIZED };
  }

  const season = await getSeason(division.season_id);
  if (!season) return { success: false, error: ERR_SEASON_NOT_FOUND };

  // Find the competition for this division. A division has at most one
  // competition (S23 invariant); if there are several we pick the first
  // — the action is idempotent enough that picking any non-completed one
  // is fine, but the v1 spec only contemplates one. Cache the full list
  // so the per-decision target-competition lookup below reuses it.
  const allLeagueComps = await listCompetitions({ kind: "league" });
  const competition = allLeagueComps.find(
    (c: Competition) => c.division_id === division.id
  );
  if (!competition) {
    return { success: false, error: ERR_COMPETITION_NOT_FOUND };
  }

  // Pre-condition: every fixture must be completed or cancelled.
  const fixtures: Fixture[] = await listFixtures({
    competitionId: competition.id,
  });
  const incomplete = fixtures.filter(
    (f) => f.status !== "completed" && f.status !== "cancelled"
  );
  if (incomplete.length > 0) {
    return {
      success: false,
      error: ERR_FIXTURES_INCOMPLETE,
      incompleteFixtureIds: incomplete.slice(0, 3).map((f) => f.id),
    };
  }

  // Pre-condition: no fixture / pairing flagged as replay_required. Reuse
  // the standings loader's helper so the rule stays single-sourced.
  if (competition.league_config) {
    const replayItems = await computeReplayItemsForCompetition(
      competition.id,
      competition.league_config
    );
    if (replayItems.length > 0) {
      return {
        success: false,
        error: ERR_REPLAY_REQUIRED_PENDING,
        replayRequired: replayItems,
      };
    }
  }

  if (!season.next_season_id) {
    return { success: false, error: ERR_NEXT_SEASON_NOT_SET_UP };
  }

  // Resolve standings — needed for both the planner input AND for the
  // entrant→team lookup the RPC payload requires.
  const standings = await getCompetitionStandings(competition.id);
  if (!standings.success) {
    return { success: false, error: standings.error };
  }
  const entrants = await listEntrants(competition.id);
  const entrantById = new Map(entrants.map((e) => [e.id, e]));

  // Build planner input. `isTiedWithNext` is computed against the next row
  // in standings order using the row-equality helper above.
  const plannerEntrants: PlannerEntrant[] = standings.data.rows.map(
    (row, idx) => {
      const entrant = entrantById.get(row.entrantId);
      const teamId = entrant?.entrant_team_id ?? "";
      const next = standings.data.rows[idx + 1];
      return {
        entrantId: row.entrantId,
        teamId,
        position: row.position,
        status: (entrant?.status ?? "active") as PlannerEntrant["status"],
        isTiedWithNext: next ? rowsAreTied(row, next) : false,
      };
    }
  );

  const overrideMap = new Map<string, PlannerOverride>();
  for (const o of input.overrides ?? []) {
    if (!o.note || o.note.trim().length === 0) {
      return {
        success: false,
        error: ERR_OVERRIDE_NOTE_REQUIRED,
        overrideNoteMissingFor: o.entrantId,
      };
    }
    overrideMap.set(o.entrantId, {
      decision: o.decision,
      note: o.note.trim(),
    });
  }

  // Run the planner.
  let decisions;
  try {
    decisions = planPromotions({
      entrants: plannerEntrants,
      promoteCount: division.promote_count,
      relegateCount: division.relegate_count,
      overrides: overrideMap,
    });
  } catch (err) {
    if (err instanceof PromotionPlannerError) {
      const result: FinalizePromotionsResult = {
        success: false,
        error: err.kind,
      };
      if (
        err.kind === "TIE_AT_PROMOTION_BOUNDARY" ||
        err.kind === "TIE_AT_RELEGATION_BOUNDARY"
      ) {
        result.ties = {
          position: (err.details.position as number) ?? 0,
          entrantIds: (err.details.entrantIds as string[]) ?? [],
        };
      }
      return result;
    }
    return { success: false, error: (err as Error).message };
  }

  // Resolve target divisions in the next season. Batch the lookup so all
  // tiers needed by this finalize are fetched in one round trip — the
  // decision loop then does in-memory lookups.
  const tiersNeeded = new Set<number>();
  for (const d of decisions) {
    const targetTier =
      d.decision === "promote"
        ? division.tier - 1
        : d.decision === "relegate"
          ? division.tier + 1
          : division.tier;
    tiersNeeded.add(targetTier);
  }
  const targetDivisionMap = await findDivisionsByTiers({
    season_id: season.next_season_id,
    league_name: division.league_name,
    tiers: Array.from(tiersNeeded),
  });

  const missingTargets: { tier: number; leagueName: string }[] = [];
  const inserts: PromotionDecisionInsert[] = [];
  for (const d of decisions) {
    const targetTier =
      d.decision === "promote"
        ? division.tier - 1
        : d.decision === "relegate"
          ? division.tier + 1
          : division.tier;
    const targetDivision = targetDivisionMap.get(targetTier) ?? null;
    if (!targetDivision) {
      missingTargets.push({
        tier: targetTier,
        leagueName: division.league_name,
      });
      continue;
    }
    const targetComp =
      allLeagueComps.find((c) => c.division_id === targetDivision.id) ?? null;
    if (!targetComp) {
      missingTargets.push({
        tier: targetTier,
        leagueName: division.league_name,
      });
      continue;
    }

    const sourceEntrant = entrantById.get(d.entrantId);
    const sourceTeamId = sourceEntrant?.entrant_team_id ?? "";
    if (!sourceTeamId) {
      return {
        success: false,
        error: `Entrant ${d.entrantId} has no team — cannot enrol`,
      };
    }
    inserts.push({
      entrantId: d.entrantId,
      decision: d.decision,
      wasManualOverride: d.wasManualOverride,
      overrideNote: d.overrideNote,
      position: d.position,
      sourceTeamId,
      targetCompetitionId: targetComp.id,
      targetDivisionId: targetDivision.id,
    });
  }

  if (missingTargets.length > 0) {
    return {
      success: false,
      error: ERR_TARGET_DIVISIONS_MISSING,
      missingTargets: dedupeMissing(missingTargets),
    };
  }

  const fin = await finalizeDivisionPromotions(
    division.id,
    inserts,
    actor.player.id
  );
  if (!fin.success) return { success: false, error: fin.error ?? "Finalize failed" };

  const promoted = inserts.filter((d) => d.decision === "promote").length;
  const relegated = inserts.filter((d) => d.decision === "relegate").length;
  const stayed = inserts.filter((d) => d.decision === "stay").length;

  await writeCompAuditLog(
    "comp.division.promotions_finalized",
    division.id,
    actor.player.id,
    {
      divisionId: division.id,
      seasonId: season.id,
      nextSeasonId: season.next_season_id,
      promoted,
      relegated,
      stayed,
    }
  );

  revalidatePath(`/competitions/${competition.id}`);
  revalidatePath("/leagues/seasons");
  revalidatePath("/leagues/divisions");
  return { success: true, promoted, relegated, stayed };
}

/**
 * Loader-side helper: rebuild the StandingsFixtureInput shape just enough
 * for `findReplayRequiredItems` to pre-pass and tell us which fixtures /
 * pairings still need a replay. Mirrors the loader's own assembly logic.
 */
async function computeReplayItemsForCompetition(
  competitionId: string,
  config: LeagueConfig
): Promise<ReplayRequiredItem[]> {
  const fixtures = await getFixturesEnriched(competitionId);
  const entrants = await listEntrants(competitionId);
  const teamToEntrant = new Map<string, string>();
  for (const e of entrants) {
    if (e.entrant_team_id !== null) teamToEntrant.set(e.entrant_team_id, e.id);
  }
  const galaFixtureIds = fixtures
    .filter((fx) => fx.fixture.pairing_mode !== "two_team")
    .map((fx) => fx.fixture.id);
  const pairingsByFixture = await listPairingsByFixtureIds(galaFixtureIds);

  const fixtureInputs: StandingsFixtureInput[] = fixtures.map((fx) => {
    const subMatches: StandingsSubMatchInput[] = fx.subMatches
      .filter((m) => m.pairing_id === null)
      .map((m) => {
        const result = fx.results.find((r) => r.match_id === m.id);
        return {
          matchId: m.id,
          sideA: { entrantId: m.entrant_a_id ?? "" },
          sideB: { entrantId: m.entrant_b_id ?? "" },
          winnerEntrantId: result?.winner_entrant_id ?? null,
          scoreA: result?.score_a,
          scoreB: result?.score_b,
        };
      });
    let pairings: StandingsPairingInput[] | undefined;
    if (fx.fixture.pairing_mode !== "two_team") {
      const pairingRows = pairingsByFixture.get(fx.fixture.id) ?? [];
      pairings = pairingRows
        .map((p): StandingsPairingInput | null => {
          const homeEntrantId = teamToEntrant.get(p.home_team_id) ?? "";
          const awayEntrantId = teamToEntrant.get(p.away_team_id) ?? "";
          if (!homeEntrantId || !awayEntrantId) return null;
          const subs: StandingsSubMatchInput[] = fx.subMatches
            .filter((m) => m.pairing_id === p.id)
            .map((m) => {
              const result = fx.results.find((r) => r.match_id === m.id);
              return {
                matchId: m.id,
                sideA: { entrantId: homeEntrantId },
                sideB: { entrantId: awayEntrantId },
                winnerEntrantId: result?.winner_entrant_id ?? null,
                scoreA: result?.score_a,
                scoreB: result?.score_b,
              };
            });
          return {
            pairingId: p.id,
            homeEntrantId,
            awayEntrantId,
            subMatches: subs,
          };
        })
        .filter((p): p is StandingsPairingInput => p !== null);
    }
    return {
      id: fx.fixture.id,
      homeEntrantId: fx.fixture.home_entrant_id,
      awayEntrantId: fx.fixture.away_entrant_id,
      status: fx.fixture.status,
      isBye: fx.fixture.is_bye,
      pairings,
      subMatches,
    };
  });
  return findReplayRequiredItems(fixtureInputs, config);
}

function dedupeMissing(
  arr: { tier: number; leagueName: string }[]
): { tier: number; leagueName: string }[] {
  const seen = new Set<string>();
  const out: { tier: number; leagueName: string }[] = [];
  for (const m of arr) {
    const k = `${m.leagueName}|${m.tier}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Division promote/relegate count editor + season next-season pointer
// ---------------------------------------------------------------------------

export async function setDivisionPromoteCountAction(
  divisionId: string,
  promoteCount: number
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) return { success: false, error: "Manager required" };

  const { updateDivisionPromoteCount } = await import("../data/divisions");
  const res = await updateDivisionPromoteCount(divisionId, promoteCount);
  if (!res.success) return res;

  await writeCompAuditLog(
    "comp.division.promote_count_updated",
    divisionId,
    actor.player.id,
    { divisionId, promoteCount }
  );

  revalidatePath("/leagues/divisions");
  return { success: true };
}

export async function setDivisionRelegateCountAction(
  divisionId: string,
  relegateCount: number
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) return { success: false, error: "Manager required" };

  const { updateDivisionRelegateCount } = await import("../data/divisions");
  const res = await updateDivisionRelegateCount(divisionId, relegateCount);
  if (!res.success) return res;

  await writeCompAuditLog(
    "comp.division.relegate_count_updated",
    divisionId,
    actor.player.id,
    { divisionId, relegateCount }
  );

  revalidatePath("/leagues/divisions");
  return { success: true };
}

export async function setNextSeasonAction(
  seasonId: string,
  nextSeasonId: string | null
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) return { success: false, error: "Manager required" };

  const res = await setNextSeasonId(seasonId, nextSeasonId);
  if (!res.success) return res;

  await writeCompAuditLog(
    "comp.season.next_season_set",
    seasonId,
    actor.player.id,
    { seasonId, nextSeasonId }
  );
  revalidatePath("/leagues/seasons");
  return { success: true };
}
