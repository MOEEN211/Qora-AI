"use server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/lib/auth"
import config from "@/config/integrations.json"
import type { ActionState } from "@/lib/form-state"
import { authorizationId } from "@/lib/integrations/schema"

export async function decideConnection(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  if (!config.mcpEnabled || !config.oauthEnabled)
    return { error: "MCP connections are disabled." }
  const id = authorizationId.safeParse(form.get("authorization_id"))
  if (!id.success) return { error: "This connection request is invalid." }
  const { supabase, user } = await requireUser()
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(
    id.data
  )
  if (error || !data)
    return {
      error:
        "This request has expired. Start the connection again in your assistant.",
    }
  if (!("authorization_id" in data)) redirect(data.redirect_url)
  if (data.user.id !== user.id)
    return { error: "Sign in with the account requesting this connection." }
  if (form.get("decision") === "deny") {
    const denied = await supabase.auth.oauth.denyAuthorization(id.data, {
      skipBrowserRedirect: true,
    })
    if (denied.error || !denied.data)
      return { error: "Could not decline this request. Try again." }
    redirect(denied.data.redirect_url)
  }
  const target = z.uuid().safeParse(form.get("workspace")),
    permission = z
      .enum(["read", "read_write"])
      .safeParse(form.get("permission"))
  if (
    !target.success ||
    !permission.success ||
    form.get("decision") !== "approve"
  )
    return { error: "Choose a workspace and access level." }
  const saved = await supabase.rpc("save_mcp_connection", {
    target: target.data,
    oauth_client: data.client.id,
    display_name: data.client.name.slice(0, 200) || "Application",
    access_level: permission.data,
  })
  if (saved.error)
    return {
      error:
        "This workspace cannot be connected. Check that you are an owner or admin.",
    }
  const approved = await supabase.auth.oauth.approveAuthorization(id.data, {
    skipBrowserRedirect: true,
  })
  if (approved.error || !approved.data) {
    await supabase.rpc("revoke_mcp_connection", { connection_id: saved.data })
    return {
      error:
        "The authorization could not be completed. Start the connection again.",
    }
  }
  revalidatePath("/dashboard/integrations")
  redirect(approved.data.redirect_url)
}
export async function disconnectConnection(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const id = z.uuid().safeParse(form.get("connection_id"))
  if (!id.success) return { error: "Invalid connection." }
  const { supabase } = await requireUser()
  const revoked = await supabase.rpc("revoke_mcp_connection", {
    connection_id: id.data,
  })
  if (revoked.error)
    return { error: "Could not disconnect this application. Try again." }
  // Local revocation blocks access immediately, even if the provider is unavailable.
  const result = await supabase.auth.oauth.revokeGrant({
    clientId: revoked.data,
  })
  const completed = result.error
    ? null
    : await supabase.rpc("complete_mcp_disconnect", { connection_id: id.data })
  revalidatePath("/dashboard/integrations")
  return result.error || completed?.error
    ? {
        success:
          "Application access removed. Use Finish disconnect to complete cleanup before reconnecting.",
      }
    : { success: "Application disconnected." }
}
