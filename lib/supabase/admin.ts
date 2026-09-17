import "server-only"
import { createClient } from "@supabase/supabase-js"

// Reserved for API authentication, reauthenticated deletion, email receipts,
// and the narrowly scoped billing RPC protocol. Billing UI reads stay user-scoped.
// Never use for ordinary app queries or membership authorization.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY
  if (!key?.startsWith("sb_secret_"))
    throw new Error("Server account management is not configured.")
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
