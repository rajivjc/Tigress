// =============================================================================
// Competitions — promotion planner (Session 24b2)
// =============================================================================
// Pure function. No DB, no React, no I/O. Takes a sorted list of entrants
// (from the standings sort), the division's promote/relegate counts, and any
// manual overrides — returns a `PlannerDecision` per non-withdrawn entrant.
// Throws `PromotionPlannerError` for tied boundaries the caller hasn't
// resolved with an override, for overrides targeting unknown entrants, and
// for overrides that would unbalance the promote/relegate counts.
// =============================================================================

export interface PlannerEntrant {
  entrantId: string;
  teamId: string;
  /** 1-based, from standings sort. Always unique within a division. */
  position: number;
  status: "active" | "withdrawn" | "archived";
  /** Set when this entrant has the same points + every configured tiebreaker
   *  value as the next entrant in the sort. The standings sort itself
   *  resolves ties via a stable alphabetic fall-through, so consecutive
   *  positions with `isTiedWithNext === true` are tied "for real" and need
   *  manager attention if they fall on the promotion or relegation boundary.
   */
  isTiedWithNext: boolean;
}

export interface PlannerOverride {
  decision: "promote" | "relegate" | "stay";
  note: string;
}

export interface PlannerInput {
  entrants: PlannerEntrant[];
  promoteCount: number;
  relegateCount: number;
  /** Indexed by entrantId. Used to break ties at the boundaries or to
   *  override the auto decision. */
  overrides: Map<string, PlannerOverride>;
}

export interface PlannerDecision {
  entrantId: string;
  decision: "promote" | "relegate" | "stay";
  wasManualOverride: boolean;
  overrideNote: string | null;
  position: number;
}

export type PromotionPlannerErrorKind =
  | "TIE_AT_PROMOTION_BOUNDARY"
  | "TIE_AT_RELEGATION_BOUNDARY"
  | "INVALID_OVERRIDE_TARGET"
  | "CONFLICTING_OVERRIDES";

export class PromotionPlannerError extends Error {
  public readonly kind: PromotionPlannerErrorKind;
  public readonly details: Record<string, unknown>;

  constructor(
    kind: PromotionPlannerErrorKind,
    message: string,
    details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "PromotionPlannerError";
    this.kind = kind;
    this.details = details;
  }
}

/**
 * Map entrants → decisions per the division's promote/relegate counts.
 *
 * Algorithm:
 *   1. Drop withdrawn entrants — they don't participate in finalize.
 *   2. Sort survivors by position ascending (defensive — caller should
 *      already pass them in standings order).
 *   3. Validate boundary ties: if `isTiedWithNext` at the promotion or
 *      relegation cut, throw unless an override resolves the boundary.
 *   4. Apply overrides — each named entrant's auto decision is replaced
 *      with the override's decision and `wasManualOverride: true`.
 *   5. Validate post-override balance — exactly `promoteCount` promotes
 *      and exactly `relegateCount` relegates.
 *   6. Return one PlannerDecision per surviving entrant.
 */
export function planPromotions(input: PlannerInput): PlannerDecision[] {
  const survivors = input.entrants
    .filter((e) => e.status !== "withdrawn")
    .slice()
    .sort((a, b) => a.position - b.position);

  // Validate override targets up front — INVALID_OVERRIDE_TARGET surfaces
  // before tie checks because a typo'd override would otherwise be silently
  // ignored AND the tie check would fire.
  const survivorIds = new Set(survivors.map((s) => s.entrantId));
  for (const overrideId of input.overrides.keys()) {
    if (!survivorIds.has(overrideId)) {
      throw new PromotionPlannerError(
        "INVALID_OVERRIDE_TARGET",
        `Override targets entrant ${overrideId} which is not in the planning set`,
        { entrantId: overrideId }
      );
    }
  }

  if (survivors.length === 0) return [];

  const promoteCount = Math.max(0, input.promoteCount);
  const relegateCount = Math.max(0, input.relegateCount);
  const total = survivors.length;

  // Default decisions: top promoteCount → promote, bottom relegateCount →
  // relegate, everyone else → stay. Capped so the spans never overlap on
  // tiny entrant counts (promoteCount + relegateCount > total).
  const promoteCutoff = Math.min(promoteCount, total);
  const relegateStartIdx = Math.max(promoteCutoff, total - relegateCount);

  // Tie detection at the promotion boundary. Only meaningful when we have
  // both a promotion slot AND a non-promotion slot below it.
  if (promoteCutoff > 0 && promoteCutoff < total) {
    const lastPromoted = survivors[promoteCutoff - 1]!;
    if (lastPromoted.isTiedWithNext) {
      const tiedEntrantIds = collectTiedSpan(survivors, promoteCutoff - 1);
      const allResolved = tiedEntrantIds.every((id) =>
        input.overrides.has(id)
      );
      if (!allResolved) {
        throw new PromotionPlannerError(
          "TIE_AT_PROMOTION_BOUNDARY",
          "Tied entrants at the promotion boundary — overrides required",
          {
            position: lastPromoted.position,
            entrantIds: tiedEntrantIds,
          }
        );
      }
    }
  }

  if (relegateCount > 0 && relegateStartIdx > 0 && relegateStartIdx < total) {
    const lastSafe = survivors[relegateStartIdx - 1]!;
    if (lastSafe.isTiedWithNext) {
      const tiedEntrantIds = collectTiedSpan(survivors, relegateStartIdx - 1);
      const allResolved = tiedEntrantIds.every((id) =>
        input.overrides.has(id)
      );
      if (!allResolved) {
        throw new PromotionPlannerError(
          "TIE_AT_RELEGATION_BOUNDARY",
          "Tied entrants at the relegation boundary — overrides required",
          {
            position: lastSafe.position,
            entrantIds: tiedEntrantIds,
          }
        );
      }
    }
  }

  const decisions: PlannerDecision[] = survivors.map((s, idx) => {
    const auto: "promote" | "relegate" | "stay" =
      idx < promoteCutoff
        ? "promote"
        : idx >= relegateStartIdx
          ? "relegate"
          : "stay";
    const override = input.overrides.get(s.entrantId);
    if (override) {
      return {
        entrantId: s.entrantId,
        decision: override.decision,
        wasManualOverride: true,
        overrideNote: override.note,
        position: s.position,
      };
    }
    return {
      entrantId: s.entrantId,
      decision: auto,
      wasManualOverride: false,
      overrideNote: null,
      position: s.position,
    };
  });

  // Post-override balance check.
  let promotes = 0;
  let relegates = 0;
  for (const d of decisions) {
    if (d.decision === "promote") promotes += 1;
    if (d.decision === "relegate") relegates += 1;
  }
  if (promotes !== promoteCutoff || relegates !== total - relegateStartIdx) {
    throw new PromotionPlannerError(
      "CONFLICTING_OVERRIDES",
      "Overrides leave the promote/relegate counts unbalanced",
      {
        expectedPromotes: promoteCutoff,
        actualPromotes: promotes,
        expectedRelegates: total - relegateStartIdx,
        actualRelegates: relegates,
      }
    );
  }

  return decisions;
}

/**
 * Walk forward from `startIdx` collecting every entrant that is tied with
 * its predecessor (via `isTiedWithNext` on the previous row). Returns all
 * tied entrant ids — caller checks every one is overridden.
 */
function collectTiedSpan(
  survivors: PlannerEntrant[],
  startIdx: number
): string[] {
  const out: string[] = [survivors[startIdx]!.entrantId];
  let i = startIdx;
  while (i < survivors.length - 1 && survivors[i]!.isTiedWithNext) {
    out.push(survivors[i + 1]!.entrantId);
    i += 1;
  }
  return out;
}
