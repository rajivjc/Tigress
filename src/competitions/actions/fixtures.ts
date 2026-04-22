"use server";

// =============================================================================
// Competitions — fixtures server actions (Session 23)
// =============================================================================
// Manager+ only. Captains don't create fixtures — they set lineups and report
// results on fixtures the manager has already scheduled.
// =============================================================================

import "server-only";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "../data/players";
import {
  cancelFixture,
  createFixture,
  getFixture,
  postponeFixture,
  updateFixtureStatus,
} from "../data/fixtures";
import { writeCompAuditLog } from "../audit";

export interface CreateFixtureActionInput {
  competitionId: string;
  homeEntrantId: string;
  awayEntrantId: string;
  fixtureDate: string;
  notes?: string | null;
}

export async function createFixtureAction(
  input: CreateFixtureActionInput
): Promise<{ success: boolean; id?: string; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const res = await createFixture({
    competition_id: input.competitionId,
    fixture_date: input.fixtureDate,
    home_entrant_id: input.homeEntrantId,
    away_entrant_id: input.awayEntrantId,
    notes: input.notes ?? null,
  });
  if (!res.success || !res.id) return res;

  await writeCompAuditLog("comp.fixture.created", res.id, actor.player.id, {
    fixtureId: res.id,
    competitionId: input.competitionId,
  });

  revalidatePath(`/competitions/${input.competitionId}`);
  return { success: true, id: res.id };
}

export async function cancelFixtureAction(
  fixtureId: string,
  reason: string | null
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const fixture = await getFixture(fixtureId);
  if (!fixture) return { success: false, error: "Fixture not found" };

  const res = await cancelFixture(fixtureId, reason);
  if (!res.success) return res;

  await writeCompAuditLog("comp.fixture.cancelled", fixtureId, actor.player.id, {
    fixtureId,
    reason,
  });

  revalidatePath(`/competitions/${fixture.competition_id}`);
  return { success: true };
}

export async function postponeFixtureAction(
  fixtureId: string,
  newDate: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const fixture = await getFixture(fixtureId);
  if (!fixture) return { success: false, error: "Fixture not found" };

  const res = await postponeFixture(fixtureId, newDate);
  if (!res.success) return res;

  await writeCompAuditLog("comp.fixture.postponed", fixtureId, actor.player.id, {
    fixtureId,
    newDate,
  });

  revalidatePath(`/competitions/${fixture.competition_id}`);
  return { success: true };
}

export async function markFixtureCompleteAction(
  fixtureId: string
): Promise<{ success: boolean; error?: string }> {
  const actor = await getCurrentActor();
  if (!actor) return { success: false, error: "Not signed in" };
  if (!actor.isManagerOrOwner) {
    return { success: false, error: "Manager or owner role required" };
  }

  const fixture = await getFixture(fixtureId);
  if (!fixture) return { success: false, error: "Fixture not found" };

  const res = await updateFixtureStatus(fixtureId, "completed");
  if (!res.success) return res;

  await writeCompAuditLog(
    "comp.fixture.completed",
    fixtureId,
    actor.player.id,
    { fixtureId }
  );

  revalidatePath(`/competitions/${fixture.competition_id}`);
  return { success: true };
}
