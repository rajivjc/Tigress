"use server";

import { revalidatePath } from "next/cache";
import {
  getCurrentAuthUserId,
  getMemberProfile,
  updateMemberProfile,
} from "@/lib/data/members";

export interface UpdateProfileInput {
  full_name: string;
  phone: string;
  avatar_url: string;
}

export async function updateProfileAction(
  input: UpdateProfileInput
): Promise<{ success: boolean; error?: string }> {
  const authUserId = await getCurrentAuthUserId();
  if (!authUserId) {
    return { success: false, error: "Not signed in" };
  }
  const member = await getMemberProfile(authUserId);
  if (!member) {
    return { success: false, error: "Member not found" };
  }

  const fullName = input.full_name.trim();
  if (!fullName) {
    return { success: false, error: "Name is required" };
  }

  const result = await updateMemberProfile(member.id, {
    full_name: fullName,
    phone: input.phone.trim() || null,
    avatar_url: input.avatar_url.trim() || null,
  });

  if (result.success) {
    revalidatePath("/profile");
    revalidatePath("/dashboard");
  }
  return result;
}
