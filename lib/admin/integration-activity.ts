import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
// Called only after the ordinary API/MCP operation succeeds for its checked principal.
export async function integrationActivity(workspace: string, source: "api" | "mcp") {
  try { await createAdminClient().rpc("report_integration_activity", { target: workspace, source }) }
  catch { /* Analytics must not fail an authorized product operation. */ }
}
