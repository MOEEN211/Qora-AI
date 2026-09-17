import config from "@/config/integrations.json"
import { authorize } from "@/lib/integrations/auth"
import { mcpHandler } from "@/lib/mcp/server"
import {
  errorResponse,
  IntegrationError,
  readBounded,
  validateOrigin,
} from "@/lib/integrations/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30
export async function POST(request: Request) {
  if (!config.mcpEnabled) return new Response(null, { status: 404 })
  try {
    validateOrigin(request)
    const auth = await authorize(request, "read", true)
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new IntegrationError(
        415,
        "unsupported_media_type",
        "Use application/json."
      )
    const body = await readBounded(request, 16384)
    if (Array.isArray(body))
      throw new IntegrationError(
        400,
        "batch_not_supported",
        "Send one MCP request at a time."
      )
    const response = await mcpHandler(auth).fetch(request, { parsedBody: body })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    return errorResponse(error, config.oauthEnabled)
  }
}
export async function GET(request: Request) {
  if (!config.mcpEnabled) return new Response(null, { status: 404 })
  try {
    validateOrigin(request)
    await authorize(request, "read", true)
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    })
  } catch (error) {
    return errorResponse(error, config.oauthEnabled)
  }
}
export const DELETE = GET
