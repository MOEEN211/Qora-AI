import "server-only"
import { cache } from "react"
import { requireUser } from "@/lib/auth"
import type { OnboardingAnswers } from "@/lib/onboarding"

export const getOnboarding = cache(async () => {
  const { user, supabase } = await requireUser()
  const { data, error } = await supabase
    .from("onboarding")
    .select("display_name,use_case,interests,current_step,status")
    .eq("user_id", user.id)
    .single()
  if (error || !data)
    throw new Error(
      "Onboarding could not be loaded. Retry, or check that kickstart installed the onboarding migration."
    )
  return data as OnboardingAnswers
})
