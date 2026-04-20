// =============================================================================
// Competitions — events hook (Session 21)
// =============================================================================
// Placeholder for future feed auto-posts (Session 26). The interface is
// stable now so the data layer can call it without knowing whether an
// implementation exists yet.
// =============================================================================

import "server-only";

export interface CompEvent {
  kind:
    | "competition_completed"
    | "match_completed"
    | "milestone_reached";
  competitionId: string;
  payload: Record<string, unknown>;
}

/**
 * No-op in S21. A later session wires this up to create `posts` rows with
 * `system_generated = true` and the appropriate body.
 */
export async function emitCompEvent(_event: CompEvent): Promise<void> {
  /* intentionally empty until S26 */
}
