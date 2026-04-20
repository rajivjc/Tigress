// =============================================================================
// Recipe book types (Session 19)
// =============================================================================
// Mirrors the schema in migration 009_recipes.sql.
// =============================================================================

export type RecipeCategory =
  | "cocktails"
  | "mocktails"
  | "shots"
  | "beer"
  | "coffee"
  | "other";

export type IngredientUnit =
  | "ml"
  | "oz"
  | "cl"
  | "dash"
  | "dashes"
  | "splash"
  | "piece"
  | "pieces"
  | "slice"
  | "slices"
  | "sprig"
  | "sprigs"
  | "scoop"
  | "scoops"
  | "tsp"
  | "tbsp"
  | "cup"
  | "drop"
  | "drops"
  | "pinch"
  | "whole";

export const RECIPE_CATEGORIES: RecipeCategory[] = [
  "cocktails",
  "mocktails",
  "shots",
  "beer",
  "coffee",
  "other",
];

export const INGREDIENT_UNITS: IngredientUnit[] = [
  "ml",
  "oz",
  "cl",
  "dash",
  "dashes",
  "splash",
  "piece",
  "pieces",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "scoop",
  "scoops",
  "tsp",
  "tbsp",
  "cup",
  "drop",
  "drops",
  "pinch",
  "whole",
];

export interface Recipe {
  id: string;
  name: string;
  category: RecipeCategory;
  notes: string | null;
  prep_time_minutes: number | null;
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  name: string;
  /** null = "to taste" */
  amount: number | null;
  /** null when amount is null */
  unit: IngredientUnit | null;
  sort_order: number;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  step_number: number;
  instruction: string;
}

export interface RecipeWithDetails {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}
