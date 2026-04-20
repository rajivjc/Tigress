"use server";

import { revalidatePath } from "next/cache";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  getRecipes,
  updateRecipe,
  updateRecipeIngredients,
  updateRecipeSteps,
  type CreateRecipeInput,
  type GetRecipesParams,
  type IngredientInput,
  type StepInput,
  type UpdateRecipeInput,
} from "@/lib/data/recipes";
import { getCurrentStaff } from "@/lib/data/staff";
import type { RecipeWithDetails } from "@/lib/types/recipes";

function isManagerOrOwner(role: string): boolean {
  return role === "manager" || role === "owner";
}

// =============================================================================
// Reads (staff+)
// =============================================================================

export async function getRecipesAction(
  params?: GetRecipesParams
): Promise<{ recipes?: RecipeWithDetails[]; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { error: "Not signed in" };

  try {
    const recipes = await getRecipes(params);
    return { recipes };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load recipes",
    };
  }
}

export async function getRecipeAction(
  recipeId: string
): Promise<{ recipe?: RecipeWithDetails; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { error: "Not signed in" };

  try {
    const recipe = await getRecipe(recipeId);
    if (!recipe) return { error: "Recipe not found" };
    return { recipe };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to load recipe",
    };
  }
}

// =============================================================================
// Writes (manager/owner)
// =============================================================================

export type CreateRecipeActionInput = Omit<CreateRecipeInput, "createdBy">;

export async function createRecipeAction(
  input: CreateRecipeActionInput
): Promise<{ success: boolean; recipeId?: string; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  if (!input.name.trim()) {
    return { success: false, error: "Name is required" };
  }

  const result = await createRecipe({
    ...input,
    createdBy: current.staff.id,
  });
  if (result.success) {
    revalidatePath("/recipes");
    if (result.recipeId) {
      revalidatePath(`/recipes/${result.recipeId}`);
    }
  }
  return result;
}

export async function updateRecipeAction(
  recipeId: string,
  input: UpdateRecipeInput
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await updateRecipe(recipeId, input);
  if (result.success) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return result;
}

export async function updateRecipeIngredientsAction(
  recipeId: string,
  ingredients: IngredientInput[]
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const cleaned = ingredients
    .filter((i) => i.name.trim().length > 0)
    .map((i, idx) => ({ ...i, sort_order: idx + 1 }));

  const result = await updateRecipeIngredients(recipeId, cleaned);
  if (result.success) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return result;
}

export async function updateRecipeStepsAction(
  recipeId: string,
  steps: StepInput[]
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }
  const cleaned = steps
    .filter((s) => s.instruction.trim().length > 0)
    .map((s, idx) => ({ ...s, step_number: idx + 1 }));

  const result = await updateRecipeSteps(recipeId, cleaned);
  if (result.success) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return result;
}

export async function deleteRecipeAction(
  recipeId: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) return { success: false, error: "Not signed in" };
  if (!isManagerOrOwner(current.role)) {
    return { success: false, error: "Manager or owner role required" };
  }

  const result = await deleteRecipe(recipeId);
  if (result.success) {
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${recipeId}`);
  }
  return result;
}
