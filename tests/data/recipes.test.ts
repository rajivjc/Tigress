import { describe, it, expect, beforeEach } from "vitest";
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  getRecipes,
  updateRecipe,
  updateRecipeIngredients,
  updateRecipeSteps,
} from "@/lib/data/recipes";
import {
  MOCK_RECIPES,
  MOCK_RECIPE_INGREDIENTS,
  MOCK_RECIPE_STEPS,
} from "@/lib/data/mock-data";
import { resetMockData } from "../helpers/reset-mock-data";

const MANAGER_ID = "mock-staff-row-2";

describe("recipe data layer (mock mode)", () => {
  beforeEach(() => {
    resetMockData();
  });

  // ===========================================================================
  // Seeded data
  // ===========================================================================
  describe("seeded recipes", () => {
    it("returns seeded recipes with ingredients and steps", async () => {
      const recipes = await getRecipes();
      expect(recipes.length).toBeGreaterThanOrEqual(5);
      const margarita = recipes.find((r) => r.recipe.name === "Margarita");
      expect(margarita).toBeTruthy();
      expect(margarita!.ingredients.length).toBeGreaterThan(0);
      expect(margarita!.steps.length).toBeGreaterThan(0);
      // Ingredients are ordered
      for (let i = 1; i < margarita!.ingredients.length; i++) {
        expect(margarita!.ingredients[i]!.sort_order).toBeGreaterThanOrEqual(
          margarita!.ingredients[i - 1]!.sort_order
        );
      }
      // Steps are ordered
      for (let i = 1; i < margarita!.steps.length; i++) {
        expect(margarita!.steps[i]!.step_number).toBeGreaterThanOrEqual(
          margarita!.steps[i - 1]!.step_number
        );
      }
    });

    it("getRecipe returns one recipe with its details", async () => {
      const detail = await getRecipe("recipe-margarita");
      expect(detail).not.toBeNull();
      expect(detail!.recipe.name).toBe("Margarita");
      expect(detail!.ingredients.some((i) => i.name.includes("Tequila"))).toBe(
        true
      );
    });

    it("getRecipe returns null for unknown id", async () => {
      const detail = await getRecipe("does-not-exist");
      expect(detail).toBeNull();
    });
  });

  // ===========================================================================
  // Create
  // ===========================================================================
  describe("createRecipe", () => {
    it("stores the recipe, ingredients, and steps", async () => {
      const before = MOCK_RECIPES.length;
      const res = await createRecipe({
        name: "Old Fashioned",
        category: "cocktails",
        notes: "Stir, don't shake.",
        prep_time_minutes: 4,
        ingredients: [
          { name: "Bourbon", amount: 60, unit: "ml" },
          { name: "Sugar cube", amount: 1, unit: "whole" },
          { name: "Angostura bitters", amount: 3, unit: "dashes" },
          { name: "Orange peel" },
        ],
        steps: [
          { instruction: "Muddle sugar and bitters in a rocks glass." },
          { instruction: "Add bourbon and a large cube of ice." },
          { instruction: "Stir until chilled, garnish with orange peel." },
        ],
        createdBy: MANAGER_ID,
      });
      expect(res.success).toBe(true);
      expect(res.recipeId).toBeTruthy();
      expect(MOCK_RECIPES.length).toBe(before + 1);

      const ingredients = MOCK_RECIPE_INGREDIENTS.filter(
        (i) => i.recipe_id === res.recipeId
      );
      expect(ingredients.length).toBe(4);
      expect(ingredients[0]!.sort_order).toBe(1);
      expect(ingredients[3]!.sort_order).toBe(4);
      // Ingredient without amount stored with nulls.
      const orangePeel = ingredients.find((i) => i.name === "Orange peel");
      expect(orangePeel).toBeTruthy();
      expect(orangePeel!.amount).toBeNull();
      expect(orangePeel!.unit).toBeNull();

      const steps = MOCK_RECIPE_STEPS.filter(
        (s) => s.recipe_id === res.recipeId
      );
      expect(steps.length).toBe(3);
      expect(steps.map((s) => s.step_number).sort()).toEqual([1, 2, 3]);
    });

    it("rejects a blank name", async () => {
      const res = await createRecipe({
        name: "   ",
        category: "cocktails",
        ingredients: [],
        steps: [],
        createdBy: MANAGER_ID,
      });
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/name/i);
    });

    it("accepts a recipe with no steps", async () => {
      const res = await createRecipe({
        name: "House Pour",
        category: "beer",
        ingredients: [{ name: "Tiger", amount: 330, unit: "ml" }],
        steps: [],
        createdBy: MANAGER_ID,
      });
      expect(res.success).toBe(true);
      const steps = MOCK_RECIPE_STEPS.filter(
        (s) => s.recipe_id === res.recipeId
      );
      expect(steps.length).toBe(0);
    });
  });

  // ===========================================================================
  // Update
  // ===========================================================================
  describe("updateRecipe", () => {
    it("updates metadata fields", async () => {
      const res = await updateRecipe("recipe-margarita", {
        name: "Tommy's Margarita",
        prep_time_minutes: 5,
      });
      expect(res.success).toBe(true);
      const stored = MOCK_RECIPES.find((r) => r.id === "recipe-margarita");
      expect(stored!.name).toBe("Tommy's Margarita");
      expect(stored!.prep_time_minutes).toBe(5);
    });

    it("allows clearing notes by passing null", async () => {
      const res = await updateRecipe("recipe-margarita", { notes: null });
      expect(res.success).toBe(true);
      const stored = MOCK_RECIPES.find((r) => r.id === "recipe-margarita");
      expect(stored!.notes).toBeNull();
    });
  });

  // ===========================================================================
  // Ingredient / step replacement
  // ===========================================================================
  describe("updateRecipeIngredients", () => {
    it("replaces the ingredient list (delete + update + insert)", async () => {
      const recipeId = "recipe-margarita";
      const existing = MOCK_RECIPE_INGREDIENTS.filter(
        (i) => i.recipe_id === recipeId
      );
      expect(existing.length).toBeGreaterThan(2);
      const firstId = existing[0]!.id;

      const res = await updateRecipeIngredients(recipeId, [
        { id: firstId, name: "Mezcal (renamed)", amount: 60, unit: "ml", sort_order: 1 },
        { name: "Agave syrup", amount: 15, unit: "ml", sort_order: 2 },
      ]);
      expect(res.success).toBe(true);

      const after = MOCK_RECIPE_INGREDIENTS.filter(
        (i) => i.recipe_id === recipeId
      );
      expect(after.length).toBe(2);
      expect(after.find((i) => i.id === firstId)!.name).toBe(
        "Mezcal (renamed)"
      );
      expect(after.some((i) => i.name === "Agave syrup")).toBe(true);
      // Order preserved
      const byOrder = after.slice().sort((a, b) => a.sort_order - b.sort_order);
      expect(byOrder[0]!.name).toBe("Mezcal (renamed)");
      expect(byOrder[1]!.name).toBe("Agave syrup");
    });

    it("stores an ingredient with no amount/unit as nulls", async () => {
      const recipeId = "recipe-margarita";
      const res = await updateRecipeIngredients(recipeId, [
        { name: "Ice", sort_order: 1 },
      ]);
      expect(res.success).toBe(true);
      const stored = MOCK_RECIPE_INGREDIENTS.filter(
        (i) => i.recipe_id === recipeId
      );
      expect(stored.length).toBe(1);
      expect(stored[0]!.amount).toBeNull();
      expect(stored[0]!.unit).toBeNull();
    });
  });

  describe("updateRecipeSteps", () => {
    it("replaces the step list with correct step_number", async () => {
      const recipeId = "recipe-margarita";
      const res = await updateRecipeSteps(recipeId, [
        { instruction: "Step A", step_number: 1 },
        { instruction: "Step B", step_number: 2 },
      ]);
      expect(res.success).toBe(true);
      const after = MOCK_RECIPE_STEPS.filter(
        (s) => s.recipe_id === recipeId
      ).sort((a, b) => a.step_number - b.step_number);
      expect(after.length).toBe(2);
      expect(after[0]!.instruction).toBe("Step A");
      expect(after[0]!.step_number).toBe(1);
      expect(after[1]!.step_number).toBe(2);
    });
  });

  // ===========================================================================
  // Delete
  // ===========================================================================
  describe("deleteRecipe (soft-delete)", () => {
    it("sets is_active = false and excludes from default list", async () => {
      const res = await deleteRecipe("recipe-margarita");
      expect(res.success).toBe(true);
      const stored = MOCK_RECIPES.find((r) => r.id === "recipe-margarita");
      expect(stored!.is_active).toBe(false);

      const listed = await getRecipes();
      expect(listed.some((r) => r.recipe.id === "recipe-margarita")).toBe(
        false
      );
    });

    it("activeOnly=false still returns soft-deleted recipes", async () => {
      await deleteRecipe("recipe-margarita");
      const all = await getRecipes({ activeOnly: false });
      expect(all.some((r) => r.recipe.id === "recipe-margarita")).toBe(true);
    });
  });

  // ===========================================================================
  // Search + filter
  // ===========================================================================
  describe("getRecipes filtering", () => {
    it("matches by recipe name (case-insensitive)", async () => {
      const results = await getRecipes({ search: "margarita" });
      expect(results.length).toBe(1);
      expect(results[0]!.recipe.name).toBe("Margarita");
    });

    it("matches by ingredient name", async () => {
      // Jägermeister only appears in the Jägerbomb recipe's ingredients.
      const results = await getRecipes({ search: "jägermeister" });
      expect(results.length).toBe(1);
      expect(results[0]!.recipe.name).toBe("Jägerbomb");
    });

    it("returns empty array when nothing matches", async () => {
      const results = await getRecipes({ search: "totally-fictional-drink" });
      expect(results).toEqual([]);
    });

    it("filters by category", async () => {
      const results = await getRecipes({ category: "mocktails" });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.recipe.category).toBe("mocktails");
      }
    });

    it("combines category and search filters", async () => {
      // Espresso appears in an Espresso Martini (cocktails) and Long Black
      // (coffee) — narrow to coffee only.
      const results = await getRecipes({
        search: "espresso",
        category: "coffee",
      });
      expect(results.length).toBe(1);
      expect(results[0]!.recipe.name).toBe("Long Black");
    });
  });
});
