// =============================================================================
// Competitions — gala fixture participants (Session 24a)
// =============================================================================
// Tracks which entrants are competing in a gala fixture. For 2-team fixtures
// the home_entrant_id / away_entrant_id columns on comp_fixtures already
// carry that information; this table only fills in for galas.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { MOCK_COMP_FIXTURE_PARTICIPANTS } from "./mock-data";

export async function listParticipantsByFixture(
  fixtureId: string
): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_FIXTURE_PARTICIPANTS.filter(
      (p) => p.fixture_id === fixtureId
    ).map((p) => p.entrant_id);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_fixture_participants")
    .select("entrant_id")
    .eq("fixture_id", fixtureId);
  return ((data as { entrant_id: string }[] | null) ?? []).map(
    (r) => r.entrant_id
  );
}

export async function setParticipantsForFixture(
  fixtureId: string,
  entrantIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    for (let i = MOCK_COMP_FIXTURE_PARTICIPANTS.length - 1; i >= 0; i--) {
      if (MOCK_COMP_FIXTURE_PARTICIPANTS[i]!.fixture_id === fixtureId) {
        MOCK_COMP_FIXTURE_PARTICIPANTS.splice(i, 1);
      }
    }
    for (const eId of entrantIds) {
      MOCK_COMP_FIXTURE_PARTICIPANTS.push({
        fixture_id: fixtureId,
        entrant_id: eId,
      });
    }
    return { success: true };
  }
  // Atomic delete+insert via comp_set_fixture_participants RPC. Both
  // statements run in the same plpgsql transaction so an insert failure
  // rolls back the delete and the fixture never lands in a zero-participant
  // state.
  const supabase = createClient();
  const { error } = await supabase.rpc("comp_set_fixture_participants", {
    p_fixture_id: fixtureId,
    p_entrant_ids: entrantIds,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}
