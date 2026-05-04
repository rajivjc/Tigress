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
  MOCK_COMP_FIXTURE_PAIRINGS,
  MOCK_COMP_FIXTURES,
  MOCK_COMP_MATCHES,
  MOCK_COMP_MATCH_LINEUPS,
  MOCK_COMP_MATCH_RESULTS,
} from "./mock-data";
import type { GeneratedFixture } from "../lib/schedule";
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
      round_number: null,
      is_bye: false,
      pairing_mode: "two_team",
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

// =============================================================================
// S24a: bulk operations for the schedule generator
// =============================================================================

/**
 * Bulk-insert generated fixtures for a league competition. The generator
 * resolves team ids to entrant ids via the caller (who knows the season +
 * division → competition mapping); the data layer just persists rows.
 *
 * For 2-team rounds, `homeTeamId` / `awayTeamId` in the generator output map
 * to entrant ids (the caller has already swapped). Bye rows have no entrants.
 */
export interface BulkCreateFixtureInput {
  generated: GeneratedFixture;
  /** Pre-resolved entrant ids — the action passes the team→entrant mapping. */
  homeEntrantId: string | null;
  awayEntrantId: string | null;
}

export async function bulkCreateFixtures(
  competitionId: string,
  rows: BulkCreateFixtureInput[]
): Promise<{ success: boolean; rows?: Fixture[]; error?: string }> {
  if (rows.length === 0) return { success: true, rows: [] };

  if (!isSupabaseConfigured()) {
    const nowIso = new Date().toISOString();
    const inserted: Fixture[] = rows.map((r) => ({
      id: randomId("comp-fixture"),
      competition_id: competitionId,
      fixture_date: r.generated.scheduledAt ?? nowIso,
      home_entrant_id: r.homeEntrantId,
      away_entrant_id: r.awayEntrantId,
      status: "scheduled",
      notes: null,
      round_number: r.generated.roundNumber,
      is_bye: r.generated.isBye,
      pairing_mode: "two_team",
      created_at: nowIso,
      updated_at: nowIso,
    }));
    MOCK_COMP_FIXTURES.push(...inserted);
    return { success: true, rows: inserted };
  }

  const supabase = createClient();
  const nowIso = new Date().toISOString();
  const payload = rows.map((r) => ({
    competition_id: competitionId,
    fixture_date: r.generated.scheduledAt ?? nowIso,
    home_entrant_id: r.homeEntrantId,
    away_entrant_id: r.awayEntrantId,
    round_number: r.generated.roundNumber,
    is_bye: r.generated.isBye,
    pairing_mode: "two_team",
  }));
  const { data, error } = await supabase
    .from("comp_fixtures")
    .insert(payload)
    .select("*");
  if (error) return { success: false, error: error.message };
  return { success: true, rows: (data as Fixture[] | null) ?? [] };
}

/**
 * Delete every fixture for a competition. When `onlyIfNoResults` is true the
 * call refuses if any sub-match has a recorded result and returns
 * `{ success: false, error: 'RESULTS_EXIST' }`. Cascades drop sub-matches,
 * lineups, results, and gala pairings via FK ON DELETE CASCADE.
 */
export async function deleteFixturesByCompetition(
  competitionId: string,
  options: { onlyIfNoResults: boolean } = { onlyIfNoResults: false }
): Promise<{ success: boolean; deleted?: number; error?: string }> {
  if (!isSupabaseConfigured()) {
    const fixtureIds = MOCK_COMP_FIXTURES.filter(
      (f) => f.competition_id === competitionId
    ).map((f) => f.id);
    if (fixtureIds.length === 0) return { success: true, deleted: 0 };

    if (options.onlyIfNoResults) {
      const matchIds = MOCK_COMP_MATCHES.filter(
        (m) => m.fixture_id !== null && fixtureIds.includes(m.fixture_id)
      ).map((m) => m.id);
      const hasResults = MOCK_COMP_MATCH_RESULTS.some((r) =>
        matchIds.includes(r.match_id)
      );
      if (hasResults) return { success: false, error: "RESULTS_EXIST" };
    }

    // Cascade in mock: pairings → matches → lineups → results → fixtures.
    for (let i = MOCK_COMP_FIXTURE_PAIRINGS.length - 1; i >= 0; i--) {
      if (fixtureIds.includes(MOCK_COMP_FIXTURE_PAIRINGS[i]!.fixture_id)) {
        MOCK_COMP_FIXTURE_PAIRINGS.splice(i, 1);
      }
    }
    const matchIds: string[] = [];
    for (let i = MOCK_COMP_MATCHES.length - 1; i >= 0; i--) {
      const fid = MOCK_COMP_MATCHES[i]!.fixture_id;
      if (fid !== null && fixtureIds.includes(fid)) {
        matchIds.push(MOCK_COMP_MATCHES[i]!.id);
        MOCK_COMP_MATCHES.splice(i, 1);
      }
    }
    for (let i = MOCK_COMP_MATCH_LINEUPS.length - 1; i >= 0; i--) {
      if (matchIds.includes(MOCK_COMP_MATCH_LINEUPS[i]!.match_id)) {
        MOCK_COMP_MATCH_LINEUPS.splice(i, 1);
      }
    }
    for (let i = MOCK_COMP_MATCH_RESULTS.length - 1; i >= 0; i--) {
      if (matchIds.includes(MOCK_COMP_MATCH_RESULTS[i]!.match_id)) {
        MOCK_COMP_MATCH_RESULTS.splice(i, 1);
      }
    }
    let deleted = 0;
    for (let i = MOCK_COMP_FIXTURES.length - 1; i >= 0; i--) {
      if (MOCK_COMP_FIXTURES[i]!.competition_id === competitionId) {
        MOCK_COMP_FIXTURES.splice(i, 1);
        deleted++;
      }
    }
    return { success: true, deleted };
  }

  const supabase = createClient();
  if (options.onlyIfNoResults) {
    const { data: matchRows } = await supabase
      .from("comp_matches")
      .select("id")
      .not("fixture_id", "is", null)
      .eq("competition_id", competitionId);
    const matchIds = ((matchRows as { id: string }[] | null) ?? []).map(
      (m) => m.id
    );
    if (matchIds.length > 0) {
      const { count } = await supabase
        .from("comp_match_results")
        .select("match_id", { count: "exact", head: true })
        .in("match_id", matchIds);
      if ((count ?? 0) > 0) {
        return { success: false, error: "RESULTS_EXIST" };
      }
    }
  }
  const { data, error } = await supabase
    .from("comp_fixtures")
    .delete()
    .eq("competition_id", competitionId)
    .select("id");
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    deleted: ((data as { id: string }[] | null) ?? []).length,
  };
}

/**
 * Create a gala fixture row (no home/away entrants — they live in
 * comp_fixture_participants and pairwise matchups in comp_fixture_pairings).
 */
export interface CreateGalaFixtureInput {
  competition_id: string;
  fixture_date: string;
  pairing_mode: "gala_round_robin" | "gala_manual";
  notes?: string | null;
}

export async function createGalaFixture(
  input: CreateGalaFixtureInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    const id = randomId("comp-fixture");
    const nowIso = new Date().toISOString();
    MOCK_COMP_FIXTURES.push({
      id,
      competition_id: input.competition_id,
      fixture_date: input.fixture_date,
      home_entrant_id: null,
      away_entrant_id: null,
      status: "scheduled",
      notes: input.notes ?? null,
      round_number: null,
      is_bye: false,
      pairing_mode: input.pairing_mode,
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
      home_entrant_id: null,
      away_entrant_id: null,
      pairing_mode: input.pairing_mode,
      notes: input.notes ?? null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

/** Used by the action layer to detect whether to allow `mode = 'empty'`. */
export async function countFixturesByCompetition(
  competitionId: string
): Promise<number> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_FIXTURES.filter((f) => f.competition_id === competitionId)
      .length;
  }
  const supabase = createClient();
  const { count } = await supabase
    .from("comp_fixtures")
    .select("id", { count: "exact", head: true })
    .eq("competition_id", competitionId);
  return count ?? 0;
}
