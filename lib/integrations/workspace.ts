import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import config from "@/config/integrations.json"
import { operations, type Operation } from "./schema"
import type { Principal } from "./auth"
import { IntegrationError } from "./http"
export async function executeOperation(
  operation: Operation,
  auth: Principal,
  input: unknown
) {
  if (!config.operations.includes(operation))
    throw new IntegrationError(
      404,
      "operation_disabled",
      "This operation is not available."
    )
  const descriptor = operations[operation]
  if (descriptor.permission === "write" && auth.permission !== "read_write")
    throw new IntegrationError(
      403,
      "insufficient_permission",
      "This credential has read-only access."
    )
  const parsed = descriptor.input.safeParse(input)
  if (!parsed.success)
    throw new IntegrationError(
      400,
      "invalid_arguments",
      "Invalid arguments. Check the documented fields and limits."
    )
  // Elevated access is encapsulated; request arguments never choose the tenant.
  const admin = createAdminClient()
  const result =
    operation === "rename_workspace"
      ? await admin
          .from("organizations")
          .update({ name: (parsed.data as { name: string }).name })
          .eq("id", auth.org_id)
          .select("id,name,slug")
          .single()
      : await admin
          .from("organizations")
          .select("id,name,slug,created_at")
          .eq("id", auth.org_id)
          .single()
  if (result.error)
    throw new IntegrationError(
      operation === "rename_workspace" ? 409 : 404,
      "workspace_unavailable",
      "Workspace unavailable."
    )
  return result.data
}
