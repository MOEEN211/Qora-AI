import "server-only"
import { cache } from "react"
import { getWorkspace } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { getBilling } from "@/lib/billing/server"

export const getSettings = cache(async () => {
  const { user, profile, organization, avatarUrl } = await getWorkspace()
  const supabase = await createClient()
  const [deletion, billing, preferences] = await Promise.all([
    supabase.rpc("account_deletion_summary"),
    getBilling(),
    supabase
      .from("notification_preferences")
      .select("email_enabled,in_app_enabled")
      .eq("user_id", user.id)
      .single(),
  ])
  if (deletion.error || preferences.error)
    throw new Error(
      "Account settings unavailable. Check that kickstart completed."
    )
  return {
    preferences: preferences.data!,
    billing,
    name: profile.full_name,
    email: user.email || "",
    avatarUrl,
    workspace: organization.name,
    workspaceId: organization.id,
    deletion: deletion.data,
  }
})
