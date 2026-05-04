// =============================================================================
// Competitions — promotion/relegation data layer (Session 24b2)
// =============================================================================
// Wraps the comp_finalize_division_promotions RPC plus the read path for the
// "Promotions history" panel. Real mode delegates to the SQL function so the
// multi-row insert + finalize stamp lands in one transaction; mock mode
// performs the same sequence on the in-memory arrays.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_DIVISIONS,
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_PROMOTION_DECISIONS,
} from "./mock-data";
import type { PromotionDecision } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface PromotionDecisionInsert {
  entrantId: string;
  decision: "promote" | "relegate" | "stay";
  wasManualOverride: boolean;
  overrideNote: string | null;
  position: number;
  sourceTeamId: string;
  targetCompetitionId: string;
  targetDivisionId: string;
}

export interface FinalizeResult {
  success: boolean;
  error?: string;
  createdEntrantIds?: string[];
}

/**
 * Atomically enrol the source-division's entrants into their target
 * divisions for the next season AND stamp the division as finalized AND
 * record one comp_promotion_decisions row per decision. Real mode goes
 * through the comp_finalize_division_promotions RPC so a partial failure
 * rolls back; mock mode performs the same work in-memory and rolls back
 * on any error.
 */
export async function finalizeDivisionPromotions(
  divisionId: string,
  decisions: PromotionDecisionInsert[],
  decidedByMemberId: string
): Promise<FinalizeResult> {
  if (decisions.length === 0) {
    return { success: false, error: "No decisions to finalize" };
  }

  if (!isSupabaseConfigured()) {
    const division = MOCK_COMP_DIVISIONS.find((d) => d.id === divisionId);
    if (!division) return { success: false, error: "Division not found" };
    if (division.promotions_finalized_at !== null) {
      return { success: false, error: "Division already finalized" };
    }

    // Build the full set of mutations first; only apply once everything is
    // valid so a mid-loop failure doesn't leave partial state behind.
    const newEntrants = decisions.map((d) => ({
      id: randomId("comp-entrant"),
      decision: d,
    }));

    const nowIso = new Date().toISOString();
    for (const ne of newEntrants) {
      MOCK_COMP_ENTRANTS.push({
        id: ne.id,
        competition_id: ne.decision.targetCompetitionId,
        entrant_member_id: null,
        entrant_guest_id: null,
        entrant_team_id: ne.decision.sourceTeamId,
        seed_number: null,
        status: "active",
        registered_at: nowIso,
      });
      MOCK_COMP_PROMOTION_DECISIONS.push({
        id: randomId("comp-prom"),
        source_division_id: divisionId,
        source_entrant_id: ne.decision.entrantId,
        source_team_id: ne.decision.sourceTeamId,
        source_position: ne.decision.position,
        target_division_id: ne.decision.targetDivisionId,
        target_entrant_id: ne.id,
        decision: ne.decision.decision,
        was_manual_override: ne.decision.wasManualOverride,
        override_note: ne.decision.overrideNote,
        decided_at: nowIso,
        decided_by_member_id: decidedByMemberId,
      });
    }
    division.promotions_finalized_at = nowIso;
    division.promotions_finalized_by = decidedByMemberId;

    return {
      success: true,
      createdEntrantIds: newEntrants.map((ne) => ne.id),
    };
  }

  const supabase = createClient();
  const payload = decisions.map((d) => ({
    entrantId: d.entrantId,
    decision: d.decision,
    wasManualOverride: d.wasManualOverride,
    overrideNote: d.overrideNote ?? "",
    position: d.position,
    sourceTeamId: d.sourceTeamId,
    targetCompetitionId: d.targetCompetitionId,
    targetDivisionId: d.targetDivisionId,
  }));
  const { error } = await supabase.rpc("comp_finalize_division_promotions", {
    p_division_id: divisionId,
    p_decisions: payload,
    p_decided_by: decidedByMemberId,
  });
  if (error) return { success: false, error: error.message };

  // Read back the entrants we just created so the caller has their ids.
  const { data: createdRows } = await supabase
    .from("comp_promotion_decisions")
    .select("target_entrant_id")
    .eq("source_division_id", divisionId);
  const createdEntrantIds = (
    (createdRows as { target_entrant_id: string }[] | null) ?? []
  ).map((r) => r.target_entrant_id);
  return { success: true, createdEntrantIds };
}

export async function listPromotionDecisionsForDivision(
  divisionId: string
): Promise<PromotionDecision[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_PROMOTION_DECISIONS.filter(
      (d) => d.source_division_id === divisionId
    )
      .slice()
      .sort((a, b) => a.source_position - b.source_position);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_promotion_decisions")
    .select("*")
    .eq("source_division_id", divisionId)
    .order("source_position", { ascending: true });
  return (data as PromotionDecision[] | null) ?? [];
}
