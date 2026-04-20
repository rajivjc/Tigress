"use client";

// =============================================================================
// RecipeListClient
// =============================================================================
// Staff-facing recipe browser. Debounced search (matches name OR ingredient)
// + category filter pills. The list is passed in fully-hydrated from the
// server; narrowing happens client-side because the catalogue is small and
// staying instant is more valuable than a round-trip on every keystroke.
// =============================================================================

import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  RecipeCategory,
  RecipeWithDetails,
} from "@/lib/types/recipes";

export interface RecipeListClientProps {
  recipes: RecipeWithDetails[];
  canManage: boolean;
}

type CategoryFilter = "all" | RecipeCategory;

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "cocktails", label: "Cocktails" },
  { value: "mocktails", label: "Mocktails" },
  { value: "shots", label: "Shots" },
  { value: "beer", label: "Beer" },
  { value: "coffee", label: "Coffee" },
  { value: "other", label: "Other" },
];

const CATEGORY_STYLES: Record<RecipeCategory, string> = {
  cocktails: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  mocktails: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  shots: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  beer: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
  coffee: "border-orange-700/40 bg-orange-900/20 text-orange-200",
  other: "border-white/10 bg-surface-2 text-white/60",
};

export function RecipeListClient({
  recipes,
  canManage,
}: RecipeListClientProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recipes.filter((r) => {
      if (category !== "all" && r.recipe.category !== category) return false;
      if (!query) return true;
      if (r.recipe.name.toLowerCase().includes(query)) return true;
      return r.ingredients.some((i) => i.name.toLowerCase().includes(query));
    });
  }, [recipes, search, category]);

  return (
    <div className="space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Bar
          </p>
          <h1 className="text-xl font-bold text-white">Recipes</h1>
          <p className="mt-0.5 text-xs text-white/50">
            Search by name or ingredient.
          </p>
        </div>
        {canManage && (
          <Link
            href="/recipes/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent/90 active:scale-[0.98]"
          >
            <Plus size={14} strokeWidth={2} />
            Add recipe
          </Link>
        )}
      </header>

      <div className="relative">
        <Search
          size={16}
          strokeWidth={1.5}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Margarita, Campari, espresso…"
          className="w-full rounded-lg border border-white/10 bg-surface-2 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORY_FILTERS.map((f) => {
          const active = category === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setCategory(f.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? "border-accent bg-accent/15 text-white"
                  : "border-white/10 bg-surface-1 text-white/60 hover:bg-white/5"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {recipes.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No recipes yet"
          description={
            canManage
              ? "Add the first recipe to get started."
              : "Ask a manager to add some."
          }
          actionLabel={canManage ? "Add recipe" : undefined}
          actionHref={canManage ? "/recipes/new" : undefined}
        />
      )}

      {recipes.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={Search}
          title={`No recipes match "${search}"`}
          description="Try a different search or category."
        />
      )}

      {filtered.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(({ recipe, ingredients }) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className="block rounded-2xl border border-white/10 bg-surface-1 p-4 transition-colors hover:bg-surface-2/70"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-white">
                    {recipe.name}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                      CATEGORY_STYLES[recipe.category]
                    }`}
                  >
                    {recipe.category}
                  </span>
                </div>
                <p className="mt-2 text-xs text-white/50">
                  {ingredients.length} ingredient
                  {ingredients.length === 1 ? "" : "s"}
                  {recipe.prep_time_minutes != null
                    ? ` · ~${recipe.prep_time_minutes} min`
                    : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
