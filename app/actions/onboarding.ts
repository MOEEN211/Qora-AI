"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { onboardingDestination, onboardingSchema } from "@/lib/onboarding"

export async function saveOnboarding(input: unknown, next?: string) {
  const { user, supabase } = await requireUser()
  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  let status: string
  try {
    const { data, error } = await supabase
      .from("onboarding")
      .update(parsed.data)
      .eq("user_id", user.id)
      .select("status")
      .single()
    if (error || !data)
      return { error: "Your answers weren’t saved. Please try again." }
    status = data.status
  } catch {
    return {
      error: "Your answers weren’t saved. Check your connection and try again.",
    }
  }
  if (status === "completed" || status === "skipped") {
    revalidatePath("/dashboard", "layout")
    redirect(onboardingDestination(next))
  }
  return { success: true }
}
