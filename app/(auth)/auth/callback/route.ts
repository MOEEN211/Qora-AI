import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { authDestination } from "@/lib/auth-destination"
import { sendWelcome } from "@/lib/email/server"

export async function GET(request: Request) {
  const origin = new URL(process.env.APP_URL!).origin
  const params = new URL(request.url).searchParams
  const code = params.get("code")
  let destination = "/login?auth=failed"
  if (code && code.length <= 4096 && !params.has("error")) {
    try {
      const supabase = await createClient()
      // PKCE verifies the code against the initiating browser's verifier cookie.
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error && data.user?.email_confirmed_at) {
        if (Date.now() - Date.parse(data.user.created_at) < 60_000)
          await sendWelcome(data.user)
        destination = await authDestination(data.user)
      }
    } catch {
      /* Never expose provider errors or OAuth tokens. */
    }
  }
  return NextResponse.redirect(new URL(destination, origin), {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  })
}
