// =============================================================================
// Competitions — fixtures (Session 23)
// =============================================================================
// A fixture is a team-vs-team match night. 1v1 shape (both entrants non-null)
// is the only shape S23 supports; multi-team galas land in S24.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_COMPETITIONS,
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_FIXTURES,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_LINEUPS,
  MOCK_COMP_MATCH_RESULTS,
} from "./mock-data";
import type {
  Fixture,
  FixtureStatus,
  Match,
  MatchLineup,
  MatchResult,
} from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ListFixturesOpts {
  competitionId: string;
  status?: FixtureStatus;
}

export async function listFixtures(
  opts: ListFixturesOpts
): Promise<Fixture[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_FIXTURES.filter((f) => {
      if (f.competition_id !== opts.competitionId) return false;
      if (opts.status && f.status !== opts.status) return false;
      return true;
    })
      .slice()
      .sort((a, b) => a.fixture_date.localeCompare(b.fixture_date));
  }
  const supabase = createClient();
  let query = supabase
    .from("comp_fixtures")
    .select("*")
    .eq("competition_id", opts.competitionId)
    .order("fixture_date", { ascending: true });
  if (opts.status) query = query.eq("status", opts.status);
  const { data } = await query;
  return (data as Fixture[] | null) ?? [];
}

export async function getFixture(id: string): Promise<Fixture | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_FIXTURES.find((f) => f.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_fixtures")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Fixture | null) ?? null;
}

export interface CreateFixtureInput {
  competition_id: string;
  fixture_date: string;
  home_entrant_id: string;
  away_entrant_id: string;
  notes?: string | null;
}

export async function createFixture(
  input: CreateFixtureInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (input.home_entrant_id === input.away_entrant_id) {
    return { success: false, error: "Home and away entrants must differ" };
  }
  if (!input.fixture_date) {
    return { success: false, error: "fixture_date is required" };
  }

  if (!isSupabaseConfigured()) {
    const comp = MOCK_COMP_COMPETITIONS.find(
      (c) => c.id === input.competition_id
    );
    if (!comp) return { success: false, error: "Competition not found" };
    if (comp.kind !== "league") {
      return { success: false, error: "Fixtures only apply to leagues" };
    }
    const home = MOCK_COMP_ENTRANTS.find((e) => e.id === input.home_entrant_id);
    const away = MOCK_COMP_ENTRANTS.find((e) => e.id === input.away_entrant_id);
    if (!home || !away) {
      return { success: false, error: "Entrant not found" };
    }
    if (
      home.competition_id !== input.competition_id ||
      away.competition_id !== input.competition_id
    ) {
      return {
        success: false,
        error: "Entrants do not belong to this competition",
      };
    }
    const id = randomId("comp-fixture");
    const nowIso = new Date().toISOString();
    MOCK_COMP_FIXTURES.push({
      id,
      competition_id: input.competition_id,
      fixture_date: input.fixture_date,
      home_entrant_id: input.home_entrant_id,
      away_entrant_id: input.away_entrant_id,
      status: "scheduled",
      notes: input.notes ?? null,
      created_at: nowIso,
      updated_at: nowIso,
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_fixtures")
    .insert({
      competition_id: input.competition_id,
      fixture_date: input.fixture_date,
      home_entrant_id: input.home_entrant_id,
      away_entrant_id: input.away_entrant_id,
      notes: input.notes ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function updateFixtureStatus(
  id: string,
  status: FixtureStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_FIXTURES.find((f) => f.id === id);
    if (!row) return { success: false, error: "Fixture not found" };
    row.status = status;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_fixtures")
    .update({ status })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function cancelFixture(
  id: string,
  reason: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_FIXTURES.find((f) => f.id === id);
    if (!row) return { success: false, error: "Fixture not found" };
    row.status = "cancelled";
    if (reason) row.notes = reason;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const update: Record<string, unknown> = { status: "cancelled" };
  if (reason) update.notes = reason;
  const { error } = await supabase
    .from("comp_fixtures")
    .update(update)
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function postponeFixture(
  id: string,
  newDate: string
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_FIXTURES.find((f) => f.id === id);
    if (!row) return { success: false, error: "Fixture not found" };
    row.status = "postponed";
    row.fixture_date = newDate;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_fixtures")
    .update({ status: "postponed", fixture_date: newDate })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export interface EnrichedFixture {
  fixture: Fixture;
  subMatches: Match[];
  results: MatchResult[];
  lineups: MatchLineup[];
}

/**
 * One-shot loader: fixtures + their sub-matches + results + lineups for a
 * whole competition. Real mode batches the queries (three `.in()` calls
 * keyed on competition_id / fixture_id / match_id) so the UI can render
 * without N+1.
 */
export async function getFixturesEnriched(
  competitionId: string
): Promise<EnrichedFixture[]> {
  const fixtures = await listFixtures({ competitionId });
  if (fixtures.length === 0) return [];

  if (!isSupabaseConfigured()) {
    return fixtures.map((fixture) => {
      const subMatches = MOCK_COMP_MATCHES.filter(
        (m) => m.fixture_id === fixture.id
      );
      const matchIds = new Set(subMatches.map((m) => m.id));
      const results = MOCK_COMP_MATCH_RESULTS.filter((r) =>
        matchIds.has(r.match_id)
      );
      const lineups = MOCK_COMP_MATCH_LINEUPS.filter((l) =>
        matchIds.has(l.match_id)
      );
      return { fixture, subMatches, results, lineups };
    });
  }

  const supabase = createClient();
  const fixtureIds = fixtures.map((f) => f.id);
  const { data: matchRows } = await supabase
    .from("comp_matches")
    .select("*")
    .in("fixture_id", fixtureIds);
  const subMatches = (matchRows as Match[] | null) ?? [];
  const matchIds = subMatches.map((m) => m.id);

  const { data: resultRows } =
    matchIds.length > 0
      ? await supabase
          .from("comp_match_results")
          .select("*")
          .in("match_id", matchIds)
      : { data: [] as MatchResult[] };
  const { data: lineupRows } =
    matchIds.length > 0
      ? await supabase
          .from("comp_match_lineups")
          .select("*")
          .in("match_id", matchIds)
      : { data: [] as MatchLineup[] };

  const byFixture = new Map<string, Match[]>();
  for (const m of subMatches) {
    if (m.fixture_id === null) continue;
    const list = byFixture.get(m.fixture_id) ?? [];
    list.push(m);
    byFixture.set(m.fixture_id, list);
  }

  return fixtures.map((fixture) => {
    const sm = byFixture.get(fixture.id) ?? [];
    const ids = new Set(sm.map((m) => m.id));
    const results = ((resultRows as MatchResult[] | null) ?? []).filter((r) =>
      ids.has(r.match_id)
    );
    const lineups = ((lineupRows as MatchLineup[] | null) ?? []).filter((l) =>
      ids.has(l.match_id)
    );
    return { fixture, subMatches: sm, results, lineups };
  });
}
