import seed from "@/config/billing-seed.json"
import type { BillingData, BillingPlan } from "./types"

// Display the agreed starter catalog before Stripe is connected. Empty IDs and
// ready=false keep these display prices out of the Checkout authorization path.
export function billingDisplayCatalog(data: BillingData): BillingPlan[] {
  if (!data.canManage) return []
  if (data.catalog.length || data.ready) return data.catalog
  return seedDisplayCatalog()
}

export function seedDisplayCatalog(): BillingPlan[] {
  return seed.plans.map((plan) => ({
    key: plan.key,
    name: plan.name,
    description: plan.description,
    product_id: "",
    prices: (["month", "year"] as const).map((interval) => ({
      id: "",
      interval,
      amount: plan[interval],
      currency: seed.currency,
    })),
  }))
}
