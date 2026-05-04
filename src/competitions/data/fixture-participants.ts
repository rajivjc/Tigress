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

interface FixtureParticipant {
  fixture_id: string;
  entrant_id: string;
}

// Mock store kept module-local — galas are S24a so no historical seed data.
const MOCK_FIXTURE_PARTICIPANTS: FixtureParticipant[] = [];

export function __resetMockFixtureParticipants(): void {
  MOCK_FIXTURE_PARTICIPANTS.length = 0;
}

export async function listParticipantsByFixture(
  fixtureId: string
): Promise<string[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_FIXTURE_PARTICIPANTS.filter((p) => p.fixture_id === fixtureId)
      .map((p) => p.entrant_id);
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
    for (let i = MOCK_FIXTURE_PARTICIPANTS.length - 1; i >= 0; i--) {
      if (MOCK_FIXTURE_PARTICIPANTS[i]!.fixture_id === fixtureId) {
        MOCK_FIXTURE_PARTICIPANTS.splice(i, 1);
      }
    }
    for (const eId of entrantIds) {
      MOCK_FIXTURE_PARTICIPANTS.push({ fixture_id: fixtureId, entrant_id: eId });
    }
    return { success: true };
  }
  const supabase = createClient();
  await supabase
    .from("comp_fixture_participants")
    .delete()
    .eq("fixture_id", fixtureId);
  const { error } = await supabase
    .from("comp_fixture_participants")
    .insert(entrantIds.map((eId) => ({ fixture_id: fixtureId, entrant_id: eId })));
  if (error) return { success: false, error: error.message };
  return { success: true };
}
