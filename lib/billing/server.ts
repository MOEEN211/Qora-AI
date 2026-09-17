import "server-only"
import Stripe from "stripe"
import { requireUser, getWorkspace } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { STRIPE_API_VERSION, syncAccount, withBillingLease } from "./engine.mjs"
import type { BillingData } from "./types"
import { billingMode } from "./environment.mjs"

export async function billingConfig(mode = billingMode()) {
  if (!["test", "live"].includes(mode)) throw new Error("Invalid billing mode.")
  const prefix = `STRIPE_${mode.toUpperCase()}`
  const key = process.env[`${prefix}_SECRET_KEY`]
  if (!key || !new RegExp(`^[sr]k_${mode}_`).test(key)) return null
  const catalog = await billingRpc("catalog", { mode })
  if (!catalog?.stripe_account || !catalog.portal_configuration_id) return null
  const account = catalog.stripe_account as string
  return {
    mode: mode as "test" | "live",
    account,
    portal: catalog.portal_configuration_id as string,
    stripe: new Stripe(key, {
      apiVersion: STRIPE_API_VERSION,
      maxNetworkRetries: 2,
      timeout: 15000,
    }),
  }
}
export async function billingRpc(
  operation: string,
  payload: Record<string, unknown>
) {
  const { data, error } = await createAdminClient().rpc("billing_admin", {
    operation,
    payload,
  })
  if (error)
    throw new Error("Billing is unavailable. Please try again shortly.")
  return data
}
export async function getBilling(workspaceId?: string): Promise<BillingData> {
  const { supabase } = await requireUser()
  const { organization, role } = await getWorkspace(workspaceId)
  const context = {
    workspace: organization.name,
    workspaceId: organization.id,
    canManage: ["owner", "admin"].includes(role),
  }
  const mode = billingMode()
  const key = process.env[`STRIPE_${mode.toUpperCase()}_SECRET_KEY`]
  if (!key || !context.canManage)
    return {
      ...context,
      ready: false,
      mode,
      catalog: [],
      customer: false,
      snapshot: { status: "none", paid: false },
    }
  const { data, error } = await supabase.rpc("my_billing", {
    target_mode: mode,
    target: organization.id,
  })
  if (error)
    return {
      ...context,
      ready: false,
      mode,
      catalog: [],
      customer: false,
      snapshot: { status: "none", paid: false },
      error: "Billing is temporarily unavailable. Please try again shortly.",
    }
  return { ...data, ...context }
}
export async function refreshWorkspaceBilling(
  mode?: string,
  workspaceId?: string
) {
  const { user } = await requireUser()
  const { organization, role } = await getWorkspace(workspaceId)
  if (role === "member")
    throw new Error("Workspace billing requires an owner or admin.")
  const config = await billingConfig(mode)
  if (!config)
    throw new Error("Billing is not configured for this environment.")
  const catalog = await billingRpc("catalog", { mode: config.mode })
  if (!catalog || catalog.stripe_account !== config.account)
    throw new Error("Billing configuration does not match this environment.")
  return withBillingLease(
    billingRpc,
    {
      user_id: user.id,
      org_id: workspaceId || organization.id,
      mode: config.mode,
      stripe_account: config.account,
    },
    (account: { id: string; customer_id?: string }, token: string) =>
      syncAccount({
        stripe: config.stripe,
        rpc: billingRpc,
        account,
        token,
        catalog: catalog.catalog,
      })
  )
}
// Buyers can use this for their own paid product routes. Authentication,
// membership and workspace isolation remain independent of subscription status.
export async function requireSubscription() {
  const { supabase } = await requireUser()
  const { organization } = await getWorkspace()
  const { data, error } = await supabase.rpc("workspace_subscription", {
    target: organization.id,
    target_mode: billingMode(),
  })
  if (error || !data?.paid)
    throw new Error("An active workspace subscription is required.")
  return data
}

export async function prepareBillingDeletion() {
  const { user } = await requireUser()
  if (!process.env.STRIPE_TEST_SECRET_KEY && !process.env.STRIPE_LIVE_SECRET_KEY) return
  const accounts = await billingRpc("deletion_accounts", { user_id: user.id })
  for (const account of accounts) {
    if (!account.customer_id) continue
    const snapshot = await refreshWorkspaceBilling(account.mode, account.org_id)
    if (!["none", "canceled", "incomplete_expired"].includes(snapshot.status))
      throw new Error(
        "Cancel your subscription and wait until its paid period ends before deleting your account."
      )
  }
}
