import "server-only"
import { requireUser } from "@/lib/auth"
import { billingMode } from "@/lib/billing/environment.mjs"
export type AdminRow = { id: string; [key: string]: unknown }
export type AdminReport = {
  rows?: AdminRow[]; enabled?: boolean; has_more?: boolean; page?: number
  [key: string]: unknown
}
export async function operatorStatus() {
  const { supabase, user } = await requireUser()
  const { data, error } = await supabase.rpc("operator_status")
  if (error) throw new Error("Admin access could not be checked. Run kickstart:admin if it is not installed.")
  return { eligible: data?.eligible === true, verified: data?.verified === true, user, supabase }
}
export async function adminRead(section: string, options: Record<string, unknown> = {}): Promise<AdminReport> {
  const { supabase } = await requireUser()
  if (section === "usage" && process.env.AI_ENABLED !== "true") return { enabled: false, rows: [] }
  const { data, error } = await supabase.rpc("operator_read", { section, options: { ...options, mode: billingMode() } })
  if (error) throw new Error("Admin data is unavailable. Your access may have changed; reload and try again.")
  return data as AdminReport
}
