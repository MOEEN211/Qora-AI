"use server"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import type { ActionState } from "@/lib/form-state"

export async function updateProfile(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { user, supabase } = await requireUser()
  const name = String(form.get("full_name") || "").trim()
  if (name.length < 2 || name.length > 80)
    return { error: "Use a name between 2 and 80 characters." }
  const { error, data } = await supabase
    .from("profiles")
    .update({ full_name: name })
    .eq("id", user.id)
    .select("id")
    .single()
  if (error || !data)
    return { error: "Your profile couldn't be saved. Please try again." }
  revalidatePath("/dashboard", "layout")
  return { success: "Profile saved." }
}

export async function updateWorkspace(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { supabase } = await requireUser()
  const name = String(form.get("name") || "").trim()
  const id = String(form.get("org_id") || "")
  if (name.length < 2 || name.length > 80)
    return { error: "Use a workspace name between 2 and 80 characters." }
  // RLS and column privileges are the authorization boundary, including forged org_id values.
  const { error, data } = await supabase
    .from("organizations")
    .update({ name })
    .eq("id", id)
    .select("id")
    .single()
  if (error || !data)
    return {
      error:
        "This workspace couldn't be updated. Check your access and try again.",
    }
  revalidatePath("/dashboard", "layout")
  return { success: "Workspace saved." }
}
