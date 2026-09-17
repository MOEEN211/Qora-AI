"use server"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import type { ActionState } from "@/lib/form-state"

export async function updateNotificationPreference(
  channel: string,
  enabled: boolean
): Promise<ActionState> {
  const { user, supabase } = await requireUser()
  if (
    !["email_enabled", "in_app_enabled"].includes(channel) ||
    typeof enabled !== "boolean"
  )
    return { error: "Choose a valid notification preference." }
  const { data, error } = await supabase
    .from("notification_preferences")
    .update({ [channel]: enabled })
    .eq("user_id", user.id)
    .select("user_id")
    .maybeSingle()
  if (error || !data)
    return { error: "Your preference couldn't be saved. Please try again." }
  revalidatePath("/dashboard/account")
  return { success: "Notification preference saved." }
}
