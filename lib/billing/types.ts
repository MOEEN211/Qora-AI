export type BillingPlan = {
  key: string
  name: string
  description: string
  product_id: string
  prices: {
    id: string
    interval: "month" | "year"
    amount: number
    currency: string
  }[]
}
export type BillingSnapshot = {
  status: string
  paid: boolean
  name?: string
  plan?: string | null
  interval?: string | null
  amount?: number | null
  currency?: string | null
  period_start?: number | null
  period_end?: number | null
  cancel_at_period_end?: boolean
}
export type BillingData = {
  workspace: string
  workspaceId: string
  canManage: boolean
  ready: boolean
  mode: "test" | "live"
  catalog: BillingPlan[]
  snapshot: BillingSnapshot
  customer: boolean
  synced_at?: string | null
  error?: string
}
