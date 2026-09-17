import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { supabaseConfig, supabaseConfigured } from "@/lib/supabase/config"

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  if (!supabaseConfigured()) return response
  const { url, key } = supabaseConfig()
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })
  await supabase.auth.getClaims()
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export const config = {
  matcher: [
    "/",
    "/pricing",
    "/faq",
    "/contact",
    "/blog/:path*",
    "/privacy",
    "/terms",
    "/docs/:path*",
    "/dashboard/:path*",
    "/onboarding",
    "/login",
    "/signup",
    "/auth/:path*",
    "/reset-password",
    "/verify-email",
    "/invite",
    "/oauth/consent",
  ],
}
