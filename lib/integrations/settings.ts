import "server-only"
import { cache } from "react"
import { getWorkspace } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import config from "@/config/integrations.json"
import type { IntegrationsProps } from "@/components/integrations/types"

export const getIntegrations = cache(async (): Promise<IntegrationsProps> => {
  const { organization, role } = await getWorkspace()
  const supabase = await createClient()
  const canManageKeys = role === "owner" || role === "admin"
  const [keys, connections] = await Promise.all([
    canManageKeys
      ? supabase.rpc("list_api_keys", { target: organization.id })
      : Promise.resolve({ data: [], error: null }),
    config.mcpEnabled && config.oauthEnabled
      ? supabase.rpc("list_mcp_connections")
      : Promise.resolve({ data: [], error: null }),
  ])
  return {
    workspace: organization.name,
    workspaceId: organization.id,
    canManageKeys,
    keys: keys.data ?? [],
    keysUnavailable: Boolean(keys.error),
    connections: connections.data ?? [],
    connectionsUnavailable: Boolean(connections.error),
    now: Date.now(),
    apiUrl: `${process.env.APP_URL}/api/v1/workspace`,
  }
})
