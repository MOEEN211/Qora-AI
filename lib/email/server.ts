import "server-only"
import type { User } from "@supabase/supabase-js"
import { deliverWelcome } from "./welcome.mjs"

export async function sendWelcome(user: User) {
  // Welcome delivery must not undo an already successful authentication operation.
  try {
    if (await deliverWelcome(user, process.env)) return
  } catch { /* Keep provider details and recipients out of logs. */ }
  console.error("Welcome email was not accepted by Resend. Check email configuration and provider logs.")
}
