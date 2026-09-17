"use server"

import { revalidatePath } from "next/cache"
import { requireUser, getWorkspace } from "@/lib/auth"
import {
  billingConfig,
  billingRpc,
  getBilling,
  refreshWorkspaceBilling,
} from "@/lib/billing/server"
import { startCheckout } from "@/lib/billing/engine.mjs"
import type { ActionState } from "@/lib/form-state"

export async function openCheckout(
  workspaceId: string,
  plan: string,
  interval: string
): Promise<ActionState & { url?: string }> {
  const { user } = await requireUser()
  const { organization, role } = await getWorkspace(workspaceId)
  if (!["owner", "admin"].includes(role))
    return { error: "Only workspace owners and admins can manage billing." }
  try {
    const config = await billingConfig()
    const billing = await getBilling(workspaceId)
    if (!config || !billing.ready || billing.workspaceId !== workspaceId)
      return { error: "Billing is not available yet." }
    const price = billing.catalog
      .find((p) => p.key === plan)
      ?.prices.find((p) => p.interval === interval)
    if (!price)
      return { error: "Choose an available plan and billing interval." }
    const current = await config.stripe.prices.retrieve(price.id)
    if (
      !current.active ||
      current.livemode !== (config.mode === "live") ||
      current.unit_amount !== price.amount ||
      current.currency !== price.currency
    )
      return {
        error:
          "This price has changed. Please refresh the catalog before subscribing.",
      }
    const url = await startCheckout({
      stripe: config.stripe,
      rpc: billingRpc,
      user,
      workspaceId: organization.id,
      mode: config.mode,
      stripeAccount: config.account,
      price,
      catalog: billing.catalog,
      appUrl: process.env.APP_URL!,
    })
    return { url }
  } catch {
    return {
      error:
        "Checkout couldn't open. If you already have a subscription, use Manage subscription. Otherwise try again shortly.",
    }
  }
}
export async function openBillingPortal(
  workspaceId: string
): Promise<ActionState & { url?: string }> {
  const { user } = await requireUser()
  const { organization, role } = await getWorkspace(workspaceId)
  if (!["owner", "admin"].includes(role))
    return { error: "Only workspace owners and admins can manage billing." }
  try {
    const config = await billingConfig()
    if (!config?.portal) return { error: "Billing is not available yet." }
    const claim = await billingRpc("claim", {
      user_id: user.id,
      org_id: organization.id,
      mode: config.mode,
      stripe_account: config.account,
    })
    if (!claim) return { error: "Billing is busy. Please try again shortly." }
    try {
      if (!claim.account.customer_id)
        return { error: "Choose a plan to start your subscription." }
      const session = await config.stripe.billingPortal.sessions.create({
        customer: claim.account.customer_id,
        configuration: config.portal,
        return_url: `${process.env.APP_URL}/dashboard/account?tab=billing`,
      })
      return { url: session.url }
    } finally {
      await billingRpc("release", { id: claim.account.id, token: claim.token })
    }
  } catch {
    return {
      error: "The billing portal couldn't open. Please try again shortly.",
    }
  }
}
export async function refreshBilling(
  workspaceId: string
): Promise<ActionState> {
  await requireUser()
  try {
    await refreshWorkspaceBilling(undefined, workspaceId)
    revalidatePath("/dashboard", "layout")
    return { success: "Subscription status refreshed." }
  } catch {
    return {
      error: "Subscription status couldn't refresh. Please try again shortly.",
    }
  }
}
