import "server-only"
import { billingRpc } from "./server"
import { billingMode } from "./environment.mjs"
import { seedDisplayCatalog } from "./catalog"
import type { BillingPlan } from "./types"

// Only the catalog operation is used here. Strip all provider/internal metadata
// before serializing public props; never fetch customer or subscription records.
export async function getPublicPricing(): Promise<{
  catalog: BillingPlan[]
  unavailable?: boolean
}> {
  const mode = billingMode()
  if (!process.env[`STRIPE_${mode.toUpperCase()}_SECRET_KEY`])
    return { catalog: seedDisplayCatalog() }
  try {
    const projection = await billingRpc("catalog", { mode })
    if (!projection) return { catalog: seedDisplayCatalog() }
    return {
      catalog: (projection.catalog as BillingPlan[]).map((plan) => ({
        key: plan.key,
        name: plan.name,
        description: plan.description,
        product_id: "",
        prices: plan.prices.map((price) => ({
          id: "",
          interval: price.interval,
          amount: price.amount,
          currency: price.currency,
        })),
      })),
    }
  } catch {
    // Do not advertise seed amounts as current prices during a provider outage.
    return { catalog: [], unavailable: true }
  }
}
