import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { RecipeEditor } from "@/components/staff/RecipeEditor";
import { getRecipe } from "@/lib/data/recipes";
import { getCurrentStaff } from "@/lib/data/staff";

export const dynamic = "force-dynamic";

interface EditRecipePageProps {
  params: { id: string };
}

export default async function EditRecipePage({ params }: EditRecipePageProps) {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    return <AccessDenied />;
  }

  const detail = await getRecipe(params.id);
  if (!detail) notFound();

  return <RecipeEditor mode="edit" initial={detail} />;
}
