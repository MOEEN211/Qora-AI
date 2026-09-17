import "server-only"
import { site } from "@/config/site"
import config from "@/config/integrations.json"
import { executeOperation } from "@/lib/integrations/workspace"
import type { Principal } from "@/lib/integrations/auth"
import { createWorkspaceMcpHandler } from "./handler"
import { integrationActivity } from "@/lib/admin/integration-activity"

export function mcpHandler(auth: Principal) {
  return createWorkspaceMcpHandler({
    name: site.name,
    permission: auth.permission,
    enabledOperations: config.operations,
    execute: async (name, input) => {
      const result = await executeOperation(name, auth, input)
      await integrationActivity(auth.org_id, "mcp")
      return result
    },
  })
}
