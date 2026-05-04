// =============================================================================
// Competitions — matches (Session 21)
// =============================================================================
// Matches always reference entrants (not players directly) so guests and
// teams flow through uniformly. `parent_match_id` links sub-matches of a
// team-vs-team night.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_COMP_ENTRANTS,
  MOCK_COMP_FIXTURES,
  MOCK_COMP_MATCHES,
} from "./mock-data";
import { RACE_TO_MAX, RACE_TO_MIN } from "../config";
import type { Match, MatchStatus, TeamMatchSlot } from "../types";

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ListMatchesOpts {
  competitionId?: string;
  entrantId?: string;
  status?: MatchStatus;
}

export async function listMatches(
  opts: ListMatchesOpts = {}
): Promise<Match[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCHES.filter((m) => {
      if (opts.competitionId && m.competition_id !== opts.competitionId) return false;
      if (opts.status && m.status !== opts.status) return false;
      if (
        opts.entrantId &&
        m.entrant_a_id !== opts.entrantId &&
        m.entrant_b_id !== opts.entrantId
      ) {
        return false;
      }
      return true;
    })
      .slice()
      .sort((a, b) => {
        if (a.round_number !== null && b.round_number !== null) {
          return a.round_number - b.round_number;
        }
        return a.created_at.localeCompare(b.created_at);
      });
  }

  const supabase = createClient();
  let query = supabase
    .from("comp_matches")
    .select("*")
    .order("round_number", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });
  if (opts.competitionId) query = query.eq("competition_id", opts.competitionId);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.entrantId) {
    query = query.or(`entrant_a_id.eq.${opts.entrantId},entrant_b_id.eq.${opts.entrantId}`);
  }
  const { data } = await query;
  return (data as Match[] | null) ?? [];
}

export async function getMatch(id: string): Promise<Match | null> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCHES.find((m) => m.id === id) ?? null;
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_matches")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Match | null) ?? null;
}

export async function listChildMatches(parentId: string): Promise<Match[]> {
  if (!isSupabaseConfigured()) {
    return MOCK_COMP_MATCHES.filter((m) => m.parent_match_id === parentId)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("comp_matches")
    .select("*")
    .eq("parent_match_id", parentId)
    .order("created_at", { ascending: true });
  return (data as Match[] | null) ?? [];
}

export interface CreateMatchInput {
  competition_id: string;
  entrant_a_id: string | null;
  entrant_b_id: string | null;
  game_type_id: string;
  race_to_a: number;
  race_to_b: number;
  round_number?: number | null;
  bracket_position?: number | null;
  parent_match_id?: string | null;
  fixture_id?: string | null;
  scheduled_at?: string | null;
  booking_id?: string | null;
  status?: MatchStatus;
  is_walkover?: boolean;
}

export async function createMatch(
  input: CreateMatchInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (
    input.entrant_a_id !== null &&
    input.entrant_b_id !== null &&
    input.entrant_a_id === input.entrant_b_id
  ) {
    return { success: false, error: "A match needs two distinct entrants" };
  }
  const status = input.status ?? "scheduled";
  if (
    status !== "scheduled" &&
    (input.entrant_a_id === null || input.entrant_b_id === null)
  ) {
    return {
      success: false,
      error: "Both entrants must be set before a match leaves scheduled",
    };
  }
  if (
    input.race_to_a < RACE_TO_MIN ||
    input.race_to_a > RACE_TO_MAX ||
    input.race_to_b < RACE_TO_MIN ||
    input.race_to_b > RACE_TO_MAX
  ) {
    return {
      success: false,
      error: `race_to values must be between ${RACE_TO_MIN} and ${RACE_TO_MAX}`,
    };
  }

  // Cross-check: entrants must belong to the competition (mock mirrors the
  // logical constraint — real mode relies on RLS + FK combined with the
  // application-level check in the server action).
  if (!isSupabaseConfigured()) {
    if (input.entrant_a_id !== null) {
      const a = MOCK_COMP_ENTRANTS.find((e) => e.id === input.entrant_a_id);
      if (!a) return { success: false, error: "Entrant not found" };
      if (a.competition_id !== input.competition_id) {
        return {
          success: false,
          error: "Entrants do not belong to this competition",
        };
      }
    }
    if (input.entrant_b_id !== null) {
      const b = MOCK_COMP_ENTRANTS.find((e) => e.id === input.entrant_b_id);
      if (!b) return { success: false, error: "Entrant not found" };
      if (b.competition_id !== input.competition_id) {
        return {
          success: false,
          error: "Entrants do not belong to this competition",
        };
      }
    }
  }

  const nowIso = new Date().toISOString();

  if (!isSupabaseConfigured()) {
    const id = randomId("comp-match");
    MOCK_COMP_MATCHES.push({
      id,
      competition_id: input.competition_id,
      entrant_a_id: input.entrant_a_id,
      entrant_b_id: input.entrant_b_id,
      game_type_id: input.game_type_id,
      race_to_a: input.race_to_a,
      race_to_b: input.race_to_b,
      round_number: input.round_number ?? null,
      bracket_position: input.bracket_position ?? null,
      parent_match_id: input.parent_match_id ?? null,
      fixture_id: input.fixture_id ?? null,
      pairing_id: null,
      scheduled_at: input.scheduled_at ?? null,
      booking_id: input.booking_id ?? null,
      status,
      is_walkover: input.is_walkover ?? false,
      created_at: nowIso,
      updated_at: nowIso,
    });
    return { success: true, id };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("comp_matches")
    .insert({
      competition_id: input.competition_id,
      entrant_a_id: input.entrant_a_id,
      entrant_b_id: input.entrant_b_id,
      game_type_id: input.game_type_id,
      race_to_a: input.race_to_a,
      race_to_b: input.race_to_b,
      round_number: input.round_number ?? null,
      bracket_position: input.bracket_position ?? null,
      parent_match_id: input.parent_match_id ?? null,
      fixture_id: input.fixture_id ?? null,
      pairing_id: null,
      scheduled_at: input.scheduled_at ?? null,
      booking_id: input.booking_id ?? null,
      status,
      is_walkover: input.is_walkover ?? false,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }
  return { success: true, id: (data as { id: string }).id };
}

export async function updateMatchStatus(
  id: string,
  status: MatchStatus
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_MATCHES.find((m) => m.id === id);
    if (!row) return { success: false, error: "Match not found" };
    row.status = status;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_matches")
    .update({ status })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Create a sub-match tied to a fixture. Auto-fills fixture_id, race_to_a /
 * race_to_b from the slot, and game_type_id from the league competition.
 * Pulls home/away entrant ids off the fixture row.
 */
export interface CreateSubMatchInput {
  fixtureId: string;
  slot: TeamMatchSlot;
  gameTypeId: string;
}

export async function createSubMatch(
  input: CreateSubMatchInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    const fixture = MOCK_COMP_FIXTURES.find((f) => f.id === input.fixtureId);
    if (!fixture) return { success: false, error: "Fixture not found" };
    if (fixture.home_entrant_id === null || fixture.away_entrant_id === null) {
      return {
        success: false,
        error: "Fixture is missing its home/away pairing",
      };
    }
    return createMatch({
      competition_id: fixture.competition_id,
      entrant_a_id: fixture.home_entrant_id,
      entrant_b_id: fixture.away_entrant_id,
      game_type_id: input.gameTypeId,
      race_to_a: input.slot.race_to,
      race_to_b: input.slot.race_to,
      fixture_id: input.fixtureId,
      scheduled_at: fixture.fixture_date,
    });
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("comp_fixtures")
    .select("id, competition_id, home_entrant_id, away_entrant_id, fixture_date")
    .eq("id", input.fixtureId)
    .maybeSingle();
  if (!data) return { success: false, error: "Fixture not found" };
  const row = data as {
    id: string;
    competition_id: string;
    home_entrant_id: string | null;
    away_entrant_id: string | null;
    fixture_date: string;
  };
  if (row.home_entrant_id === null || row.away_entrant_id === null) {
    return {
      success: false,
      error: "Fixture is missing its home/away pairing",
    };
  }
  return createMatch({
    competition_id: row.competition_id,
    entrant_a_id: row.home_entrant_id,
    entrant_b_id: row.away_entrant_id,
    game_type_id: input.gameTypeId,
    race_to_a: input.slot.race_to,
    race_to_b: input.slot.race_to,
    fixture_id: input.fixtureId,
    scheduled_at: row.fixture_date,
  });
}

export async function linkBooking(
  id: string,
  bookingId: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const row = MOCK_COMP_MATCHES.find((m) => m.id === id);
    if (!row) return { success: false, error: "Match not found" };
    row.booking_id = bookingId;
    row.updated_at = new Date().toISOString();
    return { success: true };
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("comp_matches")
    .update({ booking_id: bookingId })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
