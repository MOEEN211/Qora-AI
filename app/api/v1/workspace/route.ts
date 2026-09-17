import config from "@/config/integrations.json"
import { integrationActivity } from "@/lib/admin/integration-activity"
import { authorize } from "@/lib/integrations/auth"
import { executeOperation } from "@/lib/integrations/workspace"
import { errorResponse, json, readBounded } from "@/lib/integrations/http"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request) {
  if (!config.apiEnabled) return new Response(null, { status: 404 })
  try {
    const auth = await authorize(request)
    const data = await executeOperation("get_workspace", auth, {})
    await integrationActivity(auth.org_id, "api")
    return json({ data })
  } catch (error) {
    return errorResponse(error)
  }
}
export async function PATCH(request: Request) {
  if (!config.apiEnabled) return new Response(null, { status: 404 })
  try {
    const auth = await authorize(request, "write"),
      input = await readBounded(request, 2048)
    const data = await executeOperation("rename_workspace", auth, input)
    await integrationActivity(auth.org_id, "api")
    return json({ data })
  } catch (error) {
    return errorResponse(error)
  }
}
