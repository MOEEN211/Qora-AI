"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requireUser, getWorkspace } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkPassword } from "@/lib/password"
import {
  selectWorkspace,
  clearInvitationContext,
} from "@/lib/workspace-session"
import { deliverInvitation } from "@/lib/email/invitation.mjs"
import type { ActionState } from "@/lib/form-state"
import { billingConfig, refreshWorkspaceBilling } from "@/lib/billing/server"

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const field = (form: FormData, name: string) => String(form.get(name) || "")
function failure(message?: string): ActionState {
  const safe = [
    "Not permitted",
    "Transfer ownership before leaving this workspace",
    "Use Transfer ownership for an active teammate",
    "Choose an active teammate to transfer ownership",
    "This person must accept and verify their email first",
    "Use a workspace name between 2 and 80 characters",
    "This creation request has already been used",
    "Workspace creation limit reached. Try again in an hour",
    "Enter a valid email and role",
    "This person already belongs to the workspace",
    "Invitation send limit reached. Try again in an hour",
    "An invitation already exists. Use Resend",
    "Wait a minute before resending",
    "This invitation is no longer pending",
    "Membership no longer available",
    "Promote another owner before leaving or removing ownership",
    "Sign in with the invited email address",
    "Invitation no longer available",
    "Invitation expired or already used",
    "Resolve billing before deleting workspaces",
  ]
  return {
    error:
      message && safe.includes(message)
        ? message
        : "We couldn't complete that change. Check your access and try again.",
  }
}

export async function switchWorkspace(id: string): Promise<ActionState> {
  if (!uuid(id)) return failure()
  try {
    await getWorkspace(id)
    await selectWorkspace(id)
  } catch {
    return failure()
  }
  revalidatePath("/dashboard", "layout")
  return { success: "Workspace switched." }
}

export async function createWorkspace(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { supabase } = await requireUser()
  const request = field(form, "request_id")
  if (!uuid(request)) return failure()
  const { data, error } = await supabase.rpc("create_workspace", {
    workspace_name: field(form, "name").trim(),
    request_id: request,
  })
  if (error) return failure(error.message)
  await selectWorkspace(data)
  revalidatePath("/dashboard", "layout")
  return { success: "Workspace created." }
}

export async function inviteMember(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { supabase } = await requireUser()
  const target = field(form, "org_id"),
    replace = field(form, "invitation_id")
  if (!uuid(target) || (replace && !uuid(replace))) return failure()
  const invitedRole = field(form, "role") || "member"
  if (invitedRole !== "admin" && invitedRole !== "member")
    return failure("Enter a valid email and role")
  const { data, error } = await supabase.rpc("issue_workspace_invitation", {
    target,
    recipient: field(form, "email"),
    invited_role: invitedRole,
    replace_id: replace || null,
  })
  if (error) return failure(error.message)
  let status = "unknown"
  try {
    status = await deliverInvitation(data, process.env)
    const receipt = await createAdminClient().rpc("record_invitation_send", {
      invitation_id: data.id,
      attempt: data.send_id,
      status,
    })
    if (receipt.error) status = "unknown"
  } catch {
    status = "unknown"
  }
  revalidatePath("/dashboard/workspace")
  return status === "accepted"
    ? { success: "Invitation sent. Waiting for them to join." }
    : {
        error:
          status === "suppressed"
            ? "The invitation was saved, but email was not sent."
            : status === "failed"
              ? "The invitation was saved, but email could not be sent. Check email configuration, then resend."
              : "The invitation was saved, but send status is unknown. Check the pending invitation before resending.",
      }
}

export async function revokeInvitation(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { supabase } = await requireUser()
  const target = field(form, "org_id"),
    id = field(form, "invitation_id")
  if (!uuid(target) || !uuid(id)) return failure()
  const { error } = await supabase.rpc("revoke_workspace_invitation", {
    target,
    invitation_id: id,
  })
  if (error) return failure(error.message)
  revalidatePath("/dashboard/workspace")
  return { success: "Invitation revoked." }
}

export async function changeMember(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireUser()
  const target = field(form, "org_id"),
    person = field(form, "person"),
    role = field(form, "role")
  if (
    !uuid(target) ||
    !uuid(person) ||
    !["owner", "admin", "member", "remove"].includes(role)
  )
    return failure()
  const { error } = await supabase.rpc("change_workspace_member", {
    target,
    person,
    new_role: role === "remove" ? null : role,
  })
  if (error) return failure(error.message)
  if (person === user.id && role === "remove") {
    const { data } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .order("created_at")
      .order("org_id")
      .limit(1)
      .single()
    if (data) await selectWorkspace(data.org_id)
  }
  revalidatePath("/dashboard", "layout")
  return {
    success: role === "remove" ? "Workspace access removed." : "Role updated.",
  }
}

export async function transferOwnership(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { supabase } = await requireUser()
  const target = field(form, "org_id"),
    person = field(form, "person")
  if (!uuid(target) || !uuid(person)) return failure()
  const { error } = await supabase.rpc("transfer_workspace_ownership", {
    target,
    person,
  })
  if (error) return failure(error.message)
  revalidatePath("/dashboard", "layout")
  return { success: "Ownership transferred. You are now an Admin." }
}

export async function deleteWorkspace(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireUser()
  const target = field(form, "org_id"),
    password = field(form, "password")
  if (!uuid(target) || !password || password.length > 128)
    return { error: "Enter your current password." }
  try {
    if (!user.email || !(await checkPassword(user.email, user.id, password)))
      return {
        error:
          "Your current password is incorrect, or you have made too many attempts.",
      }
    if (await billingConfig()) {
      try {
        await refreshWorkspaceBilling(undefined, target)
      } catch {
        return {
          error:
            "Refresh this workspace's billing status before deletion. Resolve any subscription or open checkout first.",
        }
      }
    }
    const { error } = await createAdminClient().rpc("delete_workspace", {
      target,
      actor: user.id,
      confirmation: field(form, "confirmation"),
    })
    if (error) return failure(error.message)
    const { data } = await supabase
      .from("organization_members")
      .select("org_id")
      .eq("user_id", user.id)
      .order("created_at")
      .order("org_id")
      .limit(1)
      .single()
    if (data) await selectWorkspace(data.org_id)
  } catch {
    return failure()
  }
  revalidatePath("/dashboard", "layout")
  return { success: "Workspace deleted." }
}

export async function beginInvitation(form: FormData) {
  const token = field(form, "token"),
    mode = field(form, "mode")
  if (!/^[0-9a-f]{64}$/.test(token)) redirect("/invite")
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("preview_workspace_invitation", {
    invitation_token: token,
  })
  if (error || !data) redirect("/invite")
  ;(await cookies()).set("forma-invitation", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://"),
    path: "/",
    maxAge: 604800,
  })
  if (mode === "switch") await supabase.auth.signOut({ scope: "local" })
  redirect(mode === "signup" ? "/signup" : "/login")
}

export async function openInvitationLink(token: string): Promise<ActionState> {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token))
    return { error: "This invitation link is invalid." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("preview_workspace_invitation", {
    invitation_token: token,
  })
  if (error || !data)
    return {
      error:
        "This invitation may have expired, been replaced, or been revoked. Ask for a new invitation.",
    }
  const cookieStore = await cookies()
  cookieStore.set("forma-invitation", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL?.startsWith("https://"),
    path: "/",
    maxAge: 604800,
  })
  return { success: "Invitation opened." }
}

export async function acceptInvitation(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { supabase } = await requireUser()
  const token = field(form, "token")
  if (!/^[0-9a-f]{64}$/.test(token)) return failure()
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    invitation_token: token,
  })
  if (error) return failure(error.message)
  await selectWorkspace(data)
  await clearInvitationContext()
  revalidatePath("/dashboard", "layout")
  redirect("/dashboard")
}

export async function cancelInvitation() {
  await clearInvitationContext()
  redirect("/signup")
}
