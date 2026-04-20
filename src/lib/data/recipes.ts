// =============================================================================
// Recipe data accessors (Session 19)
// =============================================================================
// Server-only helpers for the recipe book. Dual-mode: falls back to the
// in-memory MOCK_RECIPE_* arrays when Supabase isn't configured so local dev
// works without a database.
//
// Search covers BOTH recipe name and ingredient name so staff can look up
// "margarita" or "campari" and find the right drink. Real mode uses ILIKE on
// each table and unions the results; the trigram index on
// recipe_ingredients.name keeps ingredient search fast.
// =============================================================================

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  MOCK_RECIPES,
  MOCK_RECIPE_INGREDIENTS,
  MOCK_RECIPE_STEPS,
} from "./mock-data";
import type {
  IngredientUnit,
  Recipe,
  RecipeCategory,
  RecipeIngredient,
  RecipeStep,
  RecipeWithDetails,
} from "@/lib/types/recipes";

// ---------- Helpers ----------

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortIngredients(rows: RecipeIngredient[]): RecipeIngredient[] {
  return rows.slice().sort((a, b) => a.sort_order - b.sort_order);
}

function sortSteps(rows: RecipeStep[]): RecipeStep[] {
  return rows.slice().sort((a, b) => a.step_number - b.step_number);
}

// =============================================================================
// Reads
// =============================================================================

export interface GetRecipesParams {
  category?: RecipeCategory;
  /** Searches recipe name OR ingredient name (case-insensitive). */
  search?: string;
  /** Defaults to true — soft-deleted recipes are hidden. */
  activeOnly?: boolean;
}

export async function getRecipes(
  params: GetRecipesParams = {}
): Promise<RecipeWithDetails[]> {
  const activeOnly = params.activeOnly ?? true;

  if (!isSupabaseConfigured()) {
    return getRecipesMock({ ...params, activeOnly });
  }
  return getRecipesReal({ ...params, activeOnly });
}

function getRecipesMock(
  params: GetRecipesParams & { activeOnly: boolean }
): RecipeWithDetails[] {
  const search = params.search?.trim().toLowerCase() ?? "";

  let recipes = MOCK_RECIPES.slice();

  if (params.activeOnly) {
    recipes = recipes.filter((r) => r.is_active);
  }
  if (params.category) {
    recipes = recipes.filter((r) => r.category === params.category);
  }
  if (search) {
    const matchingByIngredient = new Set(
      MOCK_RECIPE_INGREDIENTS.filter((i) =>
        i.name.toLowerCase().includes(search)
      ).map((i) => i.recipe_id)
    );
    recipes = recipes.filter(
      (r) =>
        r.name.toLowerCase().includes(search) || matchingByIngredient.has(r.id)
    );
  }

  return recipes
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((recipe) => ({
      recipe,
      ingredients: sortIngredients(
        MOCK_RECIPE_INGREDIENTS.filter((i) => i.recipe_id === recipe.id)
      ),
      steps: sortSteps(
        MOCK_RECIPE_STEPS.filter((s) => s.recipe_id === recipe.id)
      ),
    }));
}

async function getRecipesReal(
  params: GetRecipesParams & { activeOnly: boolean }
): Promise<RecipeWithDetails[]> {
  const supabase = createClient();

  let matchingIds: Set<string> | null = null;
  const search = params.search?.trim() ?? "";
  if (search) {
    // Search the recipes table by name and the ingredients table by name; the
    // union becomes our candidate set. We intentionally do two small queries
    // rather than a single join so each index (trgm on ingredient.name, btree
    // on recipe.name) is used directly.
    const like = `%${search.replace(/[%_]/g, "\\$&")}%`;

    const [byName, byIngredient] = await Promise.all([
      supabase.from("recipes").select("id").ilike("name", like),
      supabase.from("recipe_ingredients").select("recipe_id").ilike("name", like),
    ]);

    const ids = new Set<string>();
    for (const row of (byName.data as { id: string }[] | null) ?? []) {
      ids.add(row.id);
    }
    for (const row of (byIngredient.data as { recipe_id: string }[] | null) ??
      []) {
      ids.add(row.recipe_id);
    }
    matchingIds = ids;

    if (matchingIds.size === 0) return [];
  }

  let query = supabase
    .from("recipes")
    .select("*")
    .order("name", { ascending: true });

  if (params.activeOnly) query = query.eq("is_active", true);
  if (params.category) query = query.eq("category", params.category);
  if (matchingIds) query = query.in("id", [...matchingIds]);

  const { data: recipeRows } = await query;
  const recipes = (recipeRows as Recipe[] | null) ?? [];
  if (recipes.length === 0) return [];

  const recipeIds = recipes.map((r) => r.id);

  const [ingredientsResponse, stepsResponse] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("*")
      .in("recipe_id", recipeIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("recipe_steps")
      .select("*")
      .in("recipe_id", recipeIds)
      .order("step_number", { ascending: true }),
  ]);

  const ingredients =
    (ingredientsResponse.data as RecipeIngredient[] | null) ?? [];
  const steps = (stepsResponse.data as RecipeStep[] | null) ?? [];

  return recipes.map((recipe) => ({
    recipe,
    ingredients: ingredients.filter((i) => i.recipe_id === recipe.id),
    steps: steps.filter((s) => s.recipe_id === recipe.id),
  }));
}

export async function getRecipe(
  recipeId: string
): Promise<RecipeWithDetails | null> {
  if (!isSupabaseConfigured()) {
    const recipe = MOCK_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return null;
    return {
      recipe,
      ingredients: sortIngredients(
        MOCK_RECIPE_INGREDIENTS.filter((i) => i.recipe_id === recipeId)
      ),
      steps: sortSteps(
        MOCK_RECIPE_STEPS.filter((s) => s.recipe_id === recipeId)
      ),
    };
  }

  const supabase = createClient();
  const { data: recipeRow } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", recipeId)
    .maybeSingle();

  if (!recipeRow) return null;

  const [ingredientsResponse, stepsResponse] = await Promise.all([
    supabase
      .from("recipe_ingredients")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("recipe_steps")
      .select("*")
      .eq("recipe_id", recipeId)
      .order("step_number", { ascending: true }),
  ]);

  return {
    recipe: recipeRow as Recipe,
    ingredients: (ingredientsResponse.data as RecipeIngredient[] | null) ?? [],
    steps: (stepsResponse.data as RecipeStep[] | null) ?? [],
  };
}

// =============================================================================
// Writes
// =============================================================================

export interface CreateRecipeInput {
  name: string;
  category: RecipeCategory;
  notes?: string | null;
  prep_time_minutes?: number | null;
  image_url?: string | null;
  ingredients: {
    name: string;
    amount?: number | null;
    unit?: IngredientUnit | null;
  }[];
  steps: { instruction: string }[];
  createdBy: string;
}

export async function createRecipe(
  input: CreateRecipeInput
): Promise<{ success: boolean; recipeId?: string; error?: string }> {
  if (!input.name.trim()) {
    return { success: false, error: "Name is required" };
  }

  if (!isSupabaseConfigured()) {
    const recipeId = randomId("recipe");
    const now = nowIso();
    MOCK_RECIPES.push({
      id: recipeId,
      name: input.name.trim(),
      category: input.category,
      notes: input.notes?.trim() || null,
      prep_time_minutes: input.prep_time_minutes ?? null,
      image_url: input.image_url?.trim() || null,
      is_active: true,
      created_by: input.createdBy,
      created_at: now,
      updated_at: now,
    });
    input.ingredients
      .filter((i) => i.name.trim().length > 0)
      .forEach((ingredient, idx) => {
        MOCK_RECIPE_INGREDIENTS.push({
          id: randomId("ing"),
          recipe_id: recipeId,
          name: ingredient.name.trim(),
          amount:
            ingredient.amount === undefined || ingredient.amount === null
              ? null
              : ingredient.amount,
          unit: ingredient.unit ?? null,
          sort_order: idx + 1,
        });
      });
    input.steps
      .filter((s) => s.instruction.trim().length > 0)
      .forEach((step, idx) => {
        MOCK_RECIPE_STEPS.push({
          id: randomId("step"),
          recipe_id: recipeId,
          step_number: idx + 1,
          instruction: step.instruction.trim(),
        });
      });
    return { success: true, recipeId };
  }

  const supabase = createClient();
  const { data: inserted, error } = await supabase
    .from("recipes")
    .insert({
      name: input.name.trim(),
      category: input.category,
      notes: input.notes?.trim() || null,
      prep_time_minutes: input.prep_time_minutes ?? null,
      image_url: input.image_url?.trim() || null,
      is_active: true,
      created_by: input.createdBy,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { success: false, error: error?.message ?? "Insert failed" };
  }

  const recipeId = (inserted as { id: string }).id;

  const cleanedIngredients = input.ingredients.filter(
    (i) => i.name.trim().length > 0
  );
  if (cleanedIngredients.length > 0) {
    const { error: ingErr } = await supabase
      .from("recipe_ingredients")
      .insert(
        cleanedIngredients.map((i, idx) => ({
          recipe_id: recipeId,
          name: i.name.trim(),
          amount: i.amount ?? null,
          unit: i.unit ?? null,
          sort_order: idx + 1,
        }))
      );
    if (ingErr) {
      await supabase.from("recipes").delete().eq("id", recipeId);
      return { success: false, error: ingErr.message };
    }
  }

  const cleanedSteps = input.steps.filter((s) => s.instruction.trim().length > 0);
  if (cleanedSteps.length > 0) {
    const { error: stepErr } = await supabase
      .from("recipe_steps")
      .insert(
        cleanedSteps.map((s, idx) => ({
          recipe_id: recipeId,
          step_number: idx + 1,
          instruction: s.instruction.trim(),
        }))
      );
    if (stepErr) {
      await supabase.from("recipes").delete().eq("id", recipeId);
      return { success: false, error: stepErr.message };
    }
  }

  return { success: true, recipeId };
}

export interface UpdateRecipeInput {
  name?: string;
  category?: RecipeCategory;
  notes?: string | null;
  prep_time_minutes?: number | null;
  image_url?: string | null;
  is_active?: boolean;
}

export async function updateRecipe(
  recipeId: string,
  input: UpdateRecipeInput
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const recipe = MOCK_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { success: false, error: "Recipe not found" };
    if (input.name !== undefined) recipe.name = input.name.trim();
    if (input.category !== undefined) recipe.category = input.category;
    if (input.notes !== undefined) {
      recipe.notes = input.notes === null ? null : input.notes.trim() || null;
    }
    if (input.prep_time_minutes !== undefined) {
      recipe.prep_time_minutes = input.prep_time_minutes;
    }
    if (input.image_url !== undefined) {
      recipe.image_url =
        input.image_url === null ? null : input.image_url.trim() || null;
    }
    if (input.is_active !== undefined) recipe.is_active = input.is_active;
    recipe.updated_at = nowIso();
    return { success: true };
  }

  const supabase = createClient();
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name.trim();
  if (input.category !== undefined) update.category = input.category;
  if (input.notes !== undefined) {
    update.notes = input.notes === null ? null : input.notes.trim() || null;
  }
  if (input.prep_time_minutes !== undefined) {
    update.prep_time_minutes = input.prep_time_minutes;
  }
  if (input.image_url !== undefined) {
    update.image_url =
      input.image_url === null ? null : input.image_url.trim() || null;
  }
  if (input.is_active !== undefined) update.is_active = input.is_active;

  const { error } = await supabase
    .from("recipes")
    .update(update)
    .eq("id", recipeId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export interface IngredientInput {
  id?: string;
  name: string;
  amount?: number | null;
  unit?: IngredientUnit | null;
  sort_order: number;
}

/**
 * Full-replacement update for a recipe's ingredient list. Rows with an `id`
 * are updated, rows without an `id` are inserted, existing rows missing from
 * the payload are deleted. Mirrors the pattern used for checklist template
 * items.
 */
export async function updateRecipeIngredients(
  recipeId: string,
  ingredients: IngredientInput[]
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const recipe = MOCK_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { success: false, error: "Recipe not found" };

    const incomingIds = new Set(
      ingredients.map((i) => i.id).filter((id): id is string => Boolean(id))
    );
    for (let i = MOCK_RECIPE_INGREDIENTS.length - 1; i >= 0; i--) {
      const row = MOCK_RECIPE_INGREDIENTS[i];
      if (row.recipe_id === recipeId && !incomingIds.has(row.id)) {
        MOCK_RECIPE_INGREDIENTS.splice(i, 1);
      }
    }
    for (const incoming of ingredients) {
      if (incoming.id) {
        const existing = MOCK_RECIPE_INGREDIENTS.find(
          (r) => r.id === incoming.id
        );
        if (existing) {
          existing.name = incoming.name.trim();
          existing.amount =
            incoming.amount === undefined || incoming.amount === null
              ? null
              : incoming.amount;
          existing.unit = incoming.unit ?? null;
          existing.sort_order = incoming.sort_order;
        }
      } else {
        MOCK_RECIPE_INGREDIENTS.push({
          id: randomId("ing"),
          recipe_id: recipeId,
          name: incoming.name.trim(),
          amount:
            incoming.amount === undefined || incoming.amount === null
              ? null
              : incoming.amount,
          unit: incoming.unit ?? null,
          sort_order: incoming.sort_order,
        });
      }
    }
    recipe.updated_at = nowIso();
    return { success: true };
  }

  const supabase = createClient();

  const { data: current, error: fetchErr } = await supabase
    .from("recipe_ingredients")
    .select("id")
    .eq("recipe_id", recipeId);
  if (fetchErr) return { success: false, error: fetchErr.message };

  const currentIds = new Set(
    ((current as { id: string }[] | null) ?? []).map((r) => r.id)
  );
  const incomingIds = new Set(
    ingredients.map((i) => i.id).filter((id): id is string => Boolean(id))
  );

  const toDelete = [...currentIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("recipe_ingredients")
      .delete()
      .in("id", toDelete);
    if (deleteErr) return { success: false, error: deleteErr.message };
  }

  const toUpdate = ingredients.filter(
    (i): i is IngredientInput & { id: string } => Boolean(i.id)
  );
  for (const item of toUpdate) {
    const { error: updateErr } = await supabase
      .from("recipe_ingredients")
      .update({
        name: item.name.trim(),
        amount: item.amount ?? null,
        unit: item.unit ?? null,
        sort_order: item.sort_order,
      })
      .eq("id", item.id);
    if (updateErr) return { success: false, error: updateErr.message };
  }

  const toInsert = ingredients.filter((i) => !i.id);
  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from("recipe_ingredients")
      .insert(
        toInsert.map((i) => ({
          recipe_id: recipeId,
          name: i.name.trim(),
          amount: i.amount ?? null,
          unit: i.unit ?? null,
          sort_order: i.sort_order,
        }))
      );
    if (insertErr) return { success: false, error: insertErr.message };
  }

  await supabase
    .from("recipes")
    .update({ updated_at: nowIso() })
    .eq("id", recipeId);

  return { success: true };
}

export interface StepInput {
  id?: string;
  instruction: string;
  step_number: number;
}

export async function updateRecipeSteps(
  recipeId: string,
  steps: StepInput[]
): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    const recipe = MOCK_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { success: false, error: "Recipe not found" };

    const incomingIds = new Set(
      steps.map((s) => s.id).filter((id): id is string => Boolean(id))
    );
    for (let i = MOCK_RECIPE_STEPS.length - 1; i >= 0; i--) {
      const row = MOCK_RECIPE_STEPS[i];
      if (row.recipe_id === recipeId && !incomingIds.has(row.id)) {
        MOCK_RECIPE_STEPS.splice(i, 1);
      }
    }
    for (const incoming of steps) {
      if (incoming.id) {
        const existing = MOCK_RECIPE_STEPS.find((r) => r.id === incoming.id);
        if (existing) {
          existing.instruction = incoming.instruction.trim();
          existing.step_number = incoming.step_number;
        }
      } else {
        MOCK_RECIPE_STEPS.push({
          id: randomId("step"),
          recipe_id: recipeId,
          instruction: incoming.instruction.trim(),
          step_number: incoming.step_number,
        });
      }
    }
    recipe.updated_at = nowIso();
    return { success: true };
  }

  const supabase = createClient();

  const { data: current, error: fetchErr } = await supabase
    .from("recipe_steps")
    .select("id")
    .eq("recipe_id", recipeId);
  if (fetchErr) return { success: false, error: fetchErr.message };

  const currentIds = new Set(
    ((current as { id: string }[] | null) ?? []).map((r) => r.id)
  );
  const incomingIds = new Set(
    steps.map((s) => s.id).filter((id): id is string => Boolean(id))
  );

  const toDelete = [...currentIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: deleteErr } = await supabase
      .from("recipe_steps")
      .delete()
      .in("id", toDelete);
    if (deleteErr) return { success: false, error: deleteErr.message };
  }

  const toUpdate = steps.filter(
    (s): s is StepInput & { id: string } => Boolean(s.id)
  );
  for (const step of toUpdate) {
    const { error: updateErr } = await supabase
      .from("recipe_steps")
      .update({
        instruction: step.instruction.trim(),
        step_number: step.step_number,
      })
      .eq("id", step.id);
    if (updateErr) return { success: false, error: updateErr.message };
  }

  const toInsert = steps.filter((s) => !s.id);
  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from("recipe_steps")
      .insert(
        toInsert.map((s) => ({
          recipe_id: recipeId,
          instruction: s.instruction.trim(),
          step_number: s.step_number,
        }))
      );
    if (insertErr) return { success: false, error: insertErr.message };
  }

  await supabase
    .from("recipes")
    .update({ updated_at: nowIso() })
    .eq("id", recipeId);

  return { success: true };
}

/**
 * Soft-delete by setting is_active = false. Historical references stay intact
 * and nothing in the catalogue disappears mid-edit.
 */
export async function deleteRecipe(
  recipeId: string
): Promise<{ success: boolean; error?: string }> {
  return updateRecipe(recipeId, { is_active: false });
}
