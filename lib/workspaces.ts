import "server-only"
import { cache } from "react"
import { getWorkspace, requireUser } from "@/lib/auth"

export const getWorkspaceTeam = cache(async () => {
  const { organization, role, user } = await getWorkspace()
  const { supabase } = await requireUser()
  const { data, error } = await supabase.rpc("workspace_team", {
    target: organization.id,
  })
  if (error)
    throw new Error(
      "Workspace team could not be loaded. Check that kickstart completed."
    )
  return {
    workspace: organization,
    role,
    userId: user.id,
    team: data,
    now: Date.now(),
  }
})
