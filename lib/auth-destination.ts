import "server-only"
import { cookies } from "next/headers"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { authorizationId } from "@/lib/integrations/schema"
import { getOnboarding } from "@/lib/onboarding-server"
import {
  invitationContext,
  clearInvitationContext,
  selectWorkspace,
} from "@/lib/workspace-session"

export async function rememberAuthContinuation(value: unknown) {
  const store = await cookies()
  const parsed = authorizationId.safeParse(value)
  if (parsed.success)
    store.set("forma-auth-continuation", parsed.data, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.APP_URL?.startsWith("https://"),
      path: "/",
      maxAge: 600,
    })
  else store.delete("forma-auth-continuation")
}

export async function authDestination(user?: User) {
  const destination = await resolveAuthDestination(user)
  if (destination === "/invite") return destination
  if ((await getOnboarding()).status === "in_progress")
    return destination === "/dashboard"
      ? "/onboarding"
      : `/onboarding?next=${encodeURIComponent(destination)}`
  return destination
}

async function resolveAuthDestination(user?: User) {
  const store = await cookies()
  const continuation = authorizationId.safeParse(
    store.get("forma-auth-continuation")?.value
  )
  store.delete("forma-auth-continuation")
  const adminContinuation = store.get("forma-admin-continuation")?.value === "1"
  store.delete("forma-admin-continuation")
  const fallback = continuation.success
    ? `/oauth/consent?authorization_id=${continuation.data}`
    : adminContinuation ? "/admin" : "/dashboard"
  const candidate = user?.user_metadata?.workspace_invitation
  const context = await invitationContext()
  const token =
    context ||
    (typeof candidate === "string" && /^[0-9a-f]{64}$/.test(candidate)
      ? candidate
      : undefined)
  if (!token) return fallback
  const supabase = await createClient()
  const { data } = await supabase.rpc("preview_workspace_invitation", {
    invitation_token: token,
  })
  if (data?.accepted) {
    const accepted = await supabase.rpc("accept_workspace_invitation", {
      invitation_token: token,
    })
    if (!accepted.error) {
      await selectWorkspace(accepted.data)
      await clearInvitationContext()
      return fallback
    }
  }
  return context ? "/invite" : fallback
}
