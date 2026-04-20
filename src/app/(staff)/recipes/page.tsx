import { redirect } from "next/navigation";
import { RecipeListClient } from "@/components/staff/RecipeListClient";
import { getRecipes } from "@/lib/data/recipes";
import { getCurrentStaff } from "@/lib/data/staff";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");

  const recipes = await getRecipes();
  const canManage = current.role === "manager" || current.role === "owner";

  return <RecipeListClient recipes={recipes} canManage={canManage} />;
}
