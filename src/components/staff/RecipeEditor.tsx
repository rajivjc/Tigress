"use client";

// =============================================================================
// RecipeEditor
// =============================================================================
// Create/edit form used by manager/owner. Matches the ChecklistTemplateEditor
// pattern: full-replacement updates for ingredient + step lists, up/down
// arrows for reordering (works on mobile without a DnD dep), delete-row
// buttons, and single-action save wiring everything together.
// =============================================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createRecipeAction,
  deleteRecipeAction,
  updateRecipeAction,
  updateRecipeIngredientsAction,
  updateRecipeStepsAction,
} from "@/app/actions/recipes";
import {
  INGREDIENT_UNITS,
  RECIPE_CATEGORIES,
  type IngredientUnit,
  type RecipeCategory,
  type RecipeWithDetails,
} from "@/lib/types/recipes";

interface EditorIngredient {
  id?: string;
  key: string;
  name: string;
  /** String-backed so the input can be cleared for "to taste". */
  amount: string;
  unit: IngredientUnit | "";
}

interface EditorStep {
  id?: string;
  key: string;
  instruction: string;
}

export interface RecipeEditorProps {
  mode: "create" | "edit";
  initial?: RecipeWithDetails;
}

export function RecipeEditor({ mode, initial }: RecipeEditorProps) {
  const router = useRouter();

  const [name, setName] = useState(initial?.recipe.name ?? "");
  const [category, setCategory] = useState<RecipeCategory>(
    initial?.recipe.category ?? "cocktails"
  );
  const [prepTime, setPrepTime] = useState(
    initial?.recipe.prep_time_minutes != null
      ? String(initial.recipe.prep_time_minutes)
      : ""
  );
  const [imageUrl, setImageUrl] = useState(initial?.recipe.image_url ?? "");
  const [notes, setNotes] = useState(initial?.recipe.notes ?? "");

  const [ingredients, setIngredients] = useState<EditorIngredient[]>(
    initial
      ? initial.ingredients.map((i) => ({
          id: i.id,
          key: i.id,
          name: i.name,
          amount: i.amount != null ? String(i.amount) : "",
          unit: i.unit ?? "",
        }))
      : [makeEmptyIngredient()]
  );

  const [steps, setSteps] = useState<EditorStep[]>(
    initial
      ? initial.steps.map((s) => ({
          id: s.id,
          key: s.id,
          instruction: s.instruction,
        }))
      : [makeEmptyStep()]
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ----- Ingredient helpers -----
  const addIngredient = () =>
    setIngredients((prev) => [...prev, makeEmptyIngredient()]);

  const updateIngredient = (key: string, patch: Partial<EditorIngredient>) =>
    setIngredients((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ...patch } : i))
    );

  const removeIngredient = (key: string) =>
    setIngredients((prev) => prev.filter((i) => i.key !== key));

  const moveIngredient = (key: string, delta: -1 | 1) =>
    setIngredients((prev) => moveRow(prev, key, delta));

  // ----- Step helpers -----
  const addStep = () => setSteps((prev) => [...prev, makeEmptyStep()]);

  const updateStep = (key: string, patch: Partial<EditorStep>) =>
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s))
    );

  const removeStep = (key: string) =>
    setSteps((prev) => prev.filter((s) => s.key !== key));

  const moveStep = (key: string, delta: -1 | 1) =>
    setSteps((prev) => moveRow(prev, key, delta));

  // ----- Submit -----
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const cleanedIngredients = ingredients
      .filter((i) => i.name.trim().length > 0)
      .map((i) => ({
        ...i,
        amount: i.amount.trim() === "" ? null : Number(i.amount),
        unit: i.unit === "" ? null : i.unit,
      }));

    for (const i of cleanedIngredients) {
      if (i.amount !== null && Number.isNaN(i.amount)) {
        setError(`"${i.name}" has an invalid amount.`);
        return;
      }
    }

    const cleanedSteps = steps.filter((s) => s.instruction.trim().length > 0);

    const prepTimeValue = prepTime.trim() === "" ? null : Number(prepTime);
    if (prepTimeValue !== null && Number.isNaN(prepTimeValue)) {
      setError("Prep time must be a number.");
      return;
    }

    startTransition(async () => {
      if (mode === "create") {
        const res = await createRecipeAction({
          name,
          category,
          notes: notes.trim() || null,
          prep_time_minutes: prepTimeValue,
          image_url: imageUrl.trim() || null,
          ingredients: cleanedIngredients.map((i) => ({
            name: i.name,
            amount: i.amount,
            unit: i.unit,
          })),
          steps: cleanedSteps.map((s) => ({ instruction: s.instruction })),
        });
        if (!res.success || !res.recipeId) {
          setError(res.error ?? "Failed to create recipe");
          return;
        }
        router.push(`/recipes/${res.recipeId}`);
        router.refresh();
      } else if (initial) {
        const recipeId = initial.recipe.id;
        const metaRes = await updateRecipeAction(recipeId, {
          name,
          category,
          notes: notes.trim() || null,
          prep_time_minutes: prepTimeValue,
          image_url: imageUrl.trim() || null,
        });
        if (!metaRes.success) {
          setError(metaRes.error ?? "Failed to update recipe");
          return;
        }
        const ingRes = await updateRecipeIngredientsAction(
          recipeId,
          cleanedIngredients.map((i, idx) => ({
            id: i.id,
            name: i.name,
            amount: i.amount,
            unit: i.unit,
            sort_order: idx + 1,
          }))
        );
        if (!ingRes.success) {
          setError(ingRes.error ?? "Failed to update ingredients");
          return;
        }
        const stepRes = await updateRecipeStepsAction(
          recipeId,
          cleanedSteps.map((s, idx) => ({
            id: s.id,
            instruction: s.instruction,
            step_number: idx + 1,
          }))
        );
        if (!stepRes.success) {
          setError(stepRes.error ?? "Failed to update steps");
          return;
        }
        router.push(`/recipes/${recipeId}`);
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    if (!initial) return;
    if (
      !confirm(
        "Archive this recipe? It will be hidden from the list but past references stay intact."
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteRecipeAction(initial.recipe.id);
      if (!res.success) {
        setError(res.error ?? "Failed to archive recipe");
        return;
      }
      router.push("/recipes");
      router.refresh();
    });
  };

  const backHref =
    mode === "edit" && initial
      ? `/recipes/${initial.recipe.id}`
      : "/recipes";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <header>
        <Link
          href={backHref}
          className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/40 hover:text-white/70"
        >
          <ArrowLeft size={12} strokeWidth={1.5} />
          {mode === "edit" ? initial?.recipe.name ?? "Recipe" : "Recipes"}
        </Link>
        <h1 className="text-xl font-bold text-white">
          {mode === "create" ? "New recipe" : "Edit recipe"}
        </h1>
      </header>

      <Section label="Name">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
          placeholder="Margarita"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Section label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as RecipeCategory)}
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          >
            {RECIPE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {capitalize(c)}
              </option>
            ))}
          </select>
        </Section>
        <Section label="Prep time (minutes, optional)">
          <input
            type="number"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            min={0}
            placeholder="3"
            className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          />
        </Section>
      </div>

      <Section label="Image URL (optional)">
        <input
          type="url"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Section>

      <Section label="Notes (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Garnish tips, variations, allergens…"
          className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2.5 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </Section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            Ingredients
          </span>
          <button
            type="button"
            onClick={addIngredient}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-2 px-2.5 py-1 text-xs text-white/80 hover:bg-white/5"
          >
            <Plus size={12} strokeWidth={2} />
            Add ingredient
          </button>
        </div>
        <ul className="space-y-2">
          {ingredients.map((ingredient, idx) => (
            <li
              key={ingredient.key}
              className="rounded-xl border border-white/10 bg-surface-1 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => moveIngredient(ingredient.key, -1)}
                    disabled={idx === 0}
                    className="rounded-md border border-white/10 bg-surface-2 p-1 text-white/60 hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp size={12} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveIngredient(ingredient.key, 1)}
                    disabled={idx === ingredients.length - 1}
                    className="mt-1 rounded-md border border-white/10 bg-surface-2 p-1 text-white/60 hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown size={12} strokeWidth={2} />
                  </button>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-[1fr_80px_110px] gap-2">
                  <input
                    type="text"
                    value={ingredient.name}
                    onChange={(e) =>
                      updateIngredient(ingredient.key, {
                        name: e.target.value,
                      })
                    }
                    placeholder="Tequila"
                    maxLength={120}
                    className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <input
                    type="number"
                    value={ingredient.amount}
                    onChange={(e) =>
                      updateIngredient(ingredient.key, {
                        amount: e.target.value,
                      })
                    }
                    placeholder="60"
                    min={0}
                    step="0.01"
                    className="rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <select
                    value={ingredient.unit}
                    onChange={(e) =>
                      updateIngredient(ingredient.key, {
                        unit: e.target.value as IngredientUnit | "",
                      })
                    }
                    className="rounded-lg border border-white/10 bg-surface-2 px-2 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  >
                    <option value="">— unit —</option>
                    {INGREDIENT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => removeIngredient(ingredient.key)}
                  disabled={ingredients.length === 1}
                  className="shrink-0 rounded-md border border-white/10 bg-surface-2 p-2 text-red-300/80 hover:bg-red-500/10 disabled:opacity-30"
                  aria-label="Remove ingredient"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
              <p className="mt-1.5 pl-10 text-[11px] text-white/30">
                Leave amount blank for &ldquo;to taste&rdquo;.
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-white/40">
            Steps
          </span>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-surface-2 px-2.5 py-1 text-xs text-white/80 hover:bg-white/5"
          >
            <Plus size={12} strokeWidth={2} />
            Add step
          </button>
        </div>
        <ul className="space-y-2">
          {steps.map((step, idx) => (
            <li
              key={step.key}
              className="rounded-xl border border-white/10 bg-surface-1 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex shrink-0 flex-col">
                  <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-[11px] font-semibold text-accent">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveStep(step.key, -1)}
                    disabled={idx === 0}
                    className="rounded-md border border-white/10 bg-surface-2 p-1 text-white/60 hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp size={12} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(step.key, 1)}
                    disabled={idx === steps.length - 1}
                    className="mt-1 rounded-md border border-white/10 bg-surface-2 p-1 text-white/60 hover:bg-white/5 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown size={12} strokeWidth={2} />
                  </button>
                </div>
                <textarea
                  value={step.instruction}
                  onChange={(e) =>
                    updateStep(step.key, { instruction: e.target.value })
                  }
                  rows={2}
                  placeholder="Shake hard for 12 seconds until well-chilled."
                  className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => removeStep(step.key)}
                  disabled={steps.length === 1}
                  className="shrink-0 rounded-md border border-white/10 bg-surface-2 p-2 text-red-300/80 hover:bg-red-500/10 disabled:opacity-30"
                  aria-label="Remove step"
                >
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={backHref}
          className="flex-1 rounded-lg border border-white/10 px-4 py-3 text-center text-sm font-semibold text-white/70 hover:bg-white/5"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40 active:scale-[0.98]"
        >
          {pending
            ? "Saving…"
            : mode === "create"
              ? "Create recipe"
              : "Save changes"}
        </button>
      </div>

      {mode === "edit" && initial && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="mt-2 w-full rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-40"
        >
          Archive recipe
        </button>
      )}
    </form>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function makeEmptyIngredient(): EditorIngredient {
  return {
    key: `new-ing-${Math.random().toString(36).slice(2, 10)}`,
    name: "",
    amount: "",
    unit: "",
  };
}

function makeEmptyStep(): EditorStep {
  return {
    key: `new-step-${Math.random().toString(36).slice(2, 10)}`,
    instruction: "",
  };
}

function moveRow<T extends { key: string }>(
  rows: T[],
  key: string,
  delta: -1 | 1
): T[] {
  const idx = rows.findIndex((r) => r.key === key);
  if (idx < 0) return rows;
  const target = idx + delta;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[idx], next[target]] = [next[target]!, next[idx]!];
  return next;
}
