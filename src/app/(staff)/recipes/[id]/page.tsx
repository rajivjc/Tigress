import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Clock, Pencil } from "lucide-react";
import { getRecipe } from "@/lib/data/recipes";
import { getCurrentStaff } from "@/lib/data/staff";
import type {
  IngredientUnit,
  RecipeCategory,
  RecipeIngredient,
} from "@/lib/types/recipes";

export const dynamic = "force-dynamic";

const CATEGORY_STYLES: Record<RecipeCategory, string> = {
  cocktails: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  mocktails: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  shots: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  beer: "border-yellow-500/30 bg-yellow-500/10 text-yellow-200",
  coffee: "border-orange-700/40 bg-orange-900/20 text-orange-200",
  other: "border-white/10 bg-surface-2 text-white/60",
};

function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded.toString();
}

interface RecipeDetailPageProps {
  params: { id: string };
}

export default async function RecipeDetailPage({
  params,
}: RecipeDetailPageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const detail = await getRecipe(params.id);
  if (!detail) notFound();

  const { recipe, ingredients, steps } = detail;
  const canManage = current.role === "manager" || current.role === "owner";

  return (
    <div className="space-y-5 p-4">
      <header>
        <Link
          href="/recipes"
          className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/40 hover:text-white/70"
        >
          <ArrowLeft size={12} strokeWidth={1.5} />
          Recipes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{recipe.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                  CATEGORY_STYLES[recipe.category]
                }`}
              >
                {recipe.category}
              </span>
              {recipe.prep_time_minutes != null && (
                <span className="inline-flex items-center gap-1 text-white/50">
                  <Clock size={12} strokeWidth={1.5} />~{recipe.prep_time_minutes} min
                </span>
              )}
            </div>
          </div>
          {canManage && (
            <Link
              href={`/recipes/${recipe.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-surface-1 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/5"
            >
              <Pencil size={12} strokeWidth={1.5} />
              Edit
            </Link>
          )}
        </div>
      </header>

      {recipe.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={recipe.image_url}
          alt={recipe.name}
          className="w-full rounded-2xl border border-white/10 object-cover"
        />
      )}

      <section className="rounded-2xl border-l-2 border-accent/60 bg-surface-1/80 p-4">
        <h2 className="mb-3 text-[11px] uppercase tracking-wider text-white/40">
          Ingredients
        </h2>
        {ingredients.length === 0 ? (
          <p className="text-sm text-white/50">No ingredients listed.</p>
        ) : (
          <ul className="space-y-1.5">
            {ingredients.map((ingredient) => (
              <li
                key={ingredient.id}
                className="text-base text-white/90"
              >
                {renderIngredient(ingredient)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-surface-1 p-4">
        <h2 className="mb-3 text-[11px] uppercase tracking-wider text-white/40">
          Steps
        </h2>
        {steps.length === 0 ? (
          <p className="text-sm text-white/50">No steps — pour and serve.</p>
        ) : (
          <ol className="space-y-3">
            {steps.map((step) => (
              <li
                key={step.id}
                className="flex gap-3 text-base leading-relaxed text-white"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-sm font-semibold text-accent">
                  {step.step_number}
                </span>
                <span className="pt-0.5">{step.instruction}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {recipe.notes && (
        <section className="rounded-2xl border border-white/5 bg-surface-1/60 p-4">
          <h2 className="mb-2 text-[11px] uppercase tracking-wider text-white/40">
            Notes
          </h2>
          <p className="text-sm text-white/70">{recipe.notes}</p>
        </section>
      )}
    </div>
  );
}

function renderIngredient(ingredient: RecipeIngredient) {
  if (ingredient.amount === null || ingredient.amount === undefined) {
    return (
      <>
        <span className="font-medium text-white">{ingredient.name}</span>
        <span className="text-white/50"> — to taste</span>
      </>
    );
  }
  const amount = formatAmount(ingredient.amount);
  const unit: IngredientUnit | null = ingredient.unit;
  return (
    <>
      <span className="font-semibold tabular-nums text-white">
        {amount}
        {unit ? ` ${unit}` : ""}
      </span>{" "}
      <span className="text-white/80">{ingredient.name}</span>
    </>
  );
}

