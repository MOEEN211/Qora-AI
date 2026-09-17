import config from "@/config/integrations.json"
import { appOrigin, mcpUrl, json } from "@/lib/integrations/http"
export const dynamic = "force-dynamic"
export async function GET() {
  if (!config.mcpEnabled || !config.oauthEnabled)
    return new Response(null, { status: 404 })
  return json({
    resource: mcpUrl(),
    authorization_servers: [process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1"],
    scopes_supported: ["openid"],
    bearer_methods_supported: ["header"],
    resource_name: process.env.APP_NAME || "Workspace",
    resource_documentation: appOrigin() + "/docs/mcp",
  })
}
