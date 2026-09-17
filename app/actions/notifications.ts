"use server"

import { z } from "zod"
import { requireUser } from "@/lib/auth"

export async function markNotificationsRead(id: string | null) {
  const { user, supabase } = await requireUser()
  if (id !== null && !z.uuid().safeParse(id).success)
    return { error: "Invalid notification." }
  const readAt = new Date().toISOString()
  let query = supabase
    .from("notifications")
    .update({ read_at: readAt })
    .eq("user_id", user.id)
    .is("read_at", null)
  if (id) query = query.eq("id", id)
  const { error } = await query
  if (error)
    return {
      error: "Notifications couldn’t be marked as read. Please try again.",
    }
  return { readAt }
}
