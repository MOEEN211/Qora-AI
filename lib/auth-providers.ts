import "server-only"
import { cache } from "react"
import { supabaseConfigured, supabaseConfig } from "@/lib/supabase/config"

// The installed hosted setting is authoritative, including dashboard-managed providers.
export const googleAvailable = cache(async () => {
  if (!supabaseConfigured()) return false
  const { url, key } = supabaseConfig()
  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    return response.ok && (await response.json()).external?.google === true
  } catch {
    return false
  }
})
