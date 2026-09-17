import "server-only"
import { getWorkspace, requireUser } from "@/lib/auth"
import { billingMode } from "./environment.mjs"
import { getPublicPricing } from "./public"

export async function getWorkspacePlanLabel(): Promise<string> {
  const { supabase } = await requireUser()
  const { organization } = await getWorkspace()
  const mode = billingMode()
  if (!process.env[`STRIPE_${mode.toUpperCase()}_SECRET_KEY`]) return "Free"

  const { data, error } = await supabase.rpc("workspace_subscription", {
    target: organization.id,
    target_mode: mode,
  })
  if (error || typeof data?.paid !== "boolean") return "Plan unavailable"
  if (!data.paid) return "Free"

  const { catalog } = await getPublicPricing()
  return catalog.find((plan) => plan.key === data.plan)?.name || "Paid"
}
