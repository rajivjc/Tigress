import { redirect } from "next/navigation";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { RecipeEditor } from "@/components/staff/RecipeEditor";
import { getCurrentStaff } from "@/lib/data/staff";

export const dynamic = "force-dynamic";

export default async function NewRecipePage() {
  const current = await getCurrentStaff();
  if (!current) redirect("/login");
  if (current.role !== "manager" && current.role !== "owner") {
    return <AccessDenied />;
  }

  return <RecipeEditor mode="create" />;
}
