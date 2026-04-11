"use server";

import { revalidatePath } from "next/cache";
import { getCurrentStaff } from "@/lib/data/staff";
import { updateMemberNotes } from "@/lib/data/members";

export async function updateMemberNotesAction(
  memberId: string,
  notes: string
): Promise<{ success: boolean; error?: string }> {
  const current = await getCurrentStaff();
  if (!current) {
    return { success: false, error: "Not signed in" };
  }
  if (current.role !== "manager" && current.role !== "owner") {
    return { success: false, error: "Only managers or owners can edit notes" };
  }

  const result = await updateMemberNotes(memberId, notes);
  if (result.success) {
    revalidatePath(`/members/${memberId}`);
  }
  return result;
}
