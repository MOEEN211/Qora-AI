"use server"

import { checkPassword } from "@/lib/password"
import sharp from "sharp"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireUser, getWorkspace } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ActionState } from "@/lib/form-state"
import { prepareBillingDeletion } from "@/lib/billing/server"

export async function changeAccountPassword(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireUser()
  const current = String(form.get("current_password") || "")
  const password = String(form.get("new_password") || "")
  if (!current || current.length > 128)
    return { error: "Enter your current password." }
  if (password.length < 12 || password.length > 128)
    return { error: "Use between 12 and 128 characters for your new password." }
  if (password !== form.get("confirm_password"))
    return { error: "Your new passwords don't match." }
  if (password === current)
    return { error: "Choose a different password from your current one." }
  try {
    if (!user.email || !(await checkPassword(user.email, user.id, current)))
      return {
        error:
          "Your current password is incorrect, or you've made too many attempts. Check it and try again shortly.",
      }
    const { error } = await supabase.auth.updateUser({
      password,
      current_password: current,
    })
    if (error)
      return { error: "Your password couldn't be updated. Try again shortly." }
    return { success: "Password updated successfully." }
  } catch {
    return {
      error: "We couldn't reach the account service. Try again shortly.",
    }
  }
}

export async function saveAvatar(form: FormData): Promise<ActionState> {
  const { user, supabase } = await requireUser()
  const path = `${user.id}/avatar.webp`
  try {
    if (form.get("remove") === "true") {
      const { error } = await supabase.storage.from("avatars").remove([path])
      if (error) return { error: "Your photo couldn't be removed. Try again." }
      const result = await supabase
        .from("profiles")
        .update({ avatar_path: null })
        .eq("id", user.id)
        .select("id")
        .single()
      if (result.error)
        return {
          error:
            "Your photo was removed, but the profile couldn't be refreshed. Try again.",
        }
    } else {
      const file = form.get("photo")
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > 2 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
        return { error: "Choose a JPG, PNG, or WebP image smaller than 2 MB." }
      const bytes = await sharp(Buffer.from(await file.arrayBuffer()), {
        limitInputPixels: 25_000_000,
      })
        .rotate()
        .resize(256, 256, { fit: "cover" })
        .webp({ quality: 85 })
        .toBuffer()
      const upload = await supabase.storage
        .from("avatars")
        .upload(path, bytes, {
          upsert: true,
          contentType: "image/webp",
          cacheControl: "0",
        })
      if (upload.error)
        return { error: "Your photo couldn't be uploaded. Try again." }
      const result = await supabase
        .from("profiles")
        .update({ avatar_path: path })
        .eq("id", user.id)
        .select("id")
        .single()
      if (result.error)
        return {
          error:
            "Your photo was uploaded, but the profile couldn't be saved. Try again.",
        }
    }
    revalidatePath("/dashboard", "layout")
    return {
      success:
        form.get("remove") === "true"
          ? "Profile photo removed."
          : "Profile photo updated.",
    }
  } catch {
    return {
      error:
        "We couldn't process that photo. Try a smaller JPG, PNG, or WebP image.",
    }
  }
}

export async function generateApiKey(
  form: FormData
): Promise<ActionState & { secret?: string }> {
  const target = String(form.get("org_id") || "")
  if (!/^[0-9a-f-]{36}$/i.test(target))
    return { error: "Choose a workspace first." }
  const { organization, role } = await getWorkspace(target)
  if (!["owner", "admin"].includes(role))
    return { error: "Only workspace owners and admins can create keys." }
  const name = String(form.get("name") || "").trim()
  const permission = String(form.get("permission") || "read")
  const expiration = String(form.get("days") || "")
  if (
    name.length < 2 ||
    name.length > 60 ||
    !["read", "read_write"].includes(permission) ||
    !["30", "90", "365", "forever"].includes(expiration)
  )
    return { error: "Enter a key name, permission, and expiration." }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_api_key", {
    target: organization.id,
    key_name: name,
    key_permission: permission,
    days: expiration === "forever" ? null : Number(expiration),
  })
  if (error)
    return {
      error:
        "Key couldn't be created. Check your access and the limit of 20 active keys.",
    }
  revalidatePath("/dashboard/integrations")
  return { secret: data.secret, success: "API key created." }
}

export async function revokeApiKey(
  id: string,
  target: string
): Promise<ActionState> {
  if (!/^[0-9a-f-]{36}$/i.test(target))
    return { error: "Choose a workspace first." }
  const { organization, role } = await getWorkspace(target)
  if (!["owner", "admin"].includes(role) || !/^[0-9a-f-]{36}$/i.test(id))
    return { error: "You cannot revoke this key." }
  const supabase = await createClient()
  const { error } = await supabase.rpc("revoke_api_key", {
    target: organization.id,
    key_id: id,
  })
  if (error)
    return {
      error: "Key couldn't be revoked. Check your access and try again.",
    }
  revalidatePath("/dashboard/integrations")
  return { success: "API key revoked. It can no longer access your workspace." }
}

export async function deleteAccount(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireUser()
  const password = String(form.get("password") || "")
  if (form.get("confirmation") !== "DELETE")
    return { error: "Type DELETE to confirm." }
  if (!password || password.length > 128)
    return { error: "Enter your current password to delete your account." }
  try {
    if (!user.email || !(await checkPassword(user.email, user.id, password)))
      return {
        error:
          "Your password is incorrect, or you've made too many attempts. Try again shortly.",
      }
    const operatorDeletion = await supabase.rpc("operator_deletion_allowed")
    if (operatorDeletion.error || operatorDeletion.data !== true)
      return { error: "Add another admin before deleting the last admin account, or retry when account access is available." }
    const { data, error } = await supabase.rpc("account_deletion_summary")
    if (error || data.blocked_workspaces.length)
      return {
        error:
          "Transfer ownership of your shared workspaces before deleting your account.",
      }
    try { await prepareBillingDeletion() }
    catch { return { error: "Resolve your subscriptions before deleting your account. Cancel in Billing, wait until the paid period ends, and refresh your billing status. Any open checkout must expire first." } }
    const admin = createAdminClient()
    const removed = await admin.storage
      .from("avatars")
      .remove([`${user.id}/avatar.webp`])
    if (removed.error)
      return {
        error:
          "We couldn't remove your profile photo. Your account has not been deleted. Try again.",
      }
    // The Auth deletion trigger checks ownership again inside the deletion transaction.
    const result = await admin.auth.admin.deleteUser(user.id)
    if (result.error)
      return {
        error:
          "Your account couldn't be deleted. Check workspace ownership and any outstanding billing or stored files, then try again.",
      }
    await supabase.auth.signOut({ scope: "local" })
  } catch {
    return {
      error: "Account deletion is unavailable right now. Try again shortly.",
    }
  }
  revalidatePath("/", "layout")
  redirect("/login?account=deleted")
}
