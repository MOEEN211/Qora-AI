import { NextRequest, NextResponse } from "next/server"
import { optionalUser } from "@/lib/auth"
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" }
  if (request.headers.get("origin") !== request.nextUrl.origin) return new NextResponse(null, { status: 403, headers })
  try {
    const user = await optionalUser(); if (!user?.user.email_confirmed_at) return new NextResponse(null, { status: 401, headers })
    const raw = await request.text(); if (raw.length > 256) return new NextResponse(null, { status: 413, headers })
    const { workspace } = JSON.parse(raw)
    if (workspace !== null && (typeof workspace !== "string" || !/^[a-f0-9-]{36}$/.test(workspace))) return new NextResponse(null, { status: 400, headers })
    const result = await user.supabase.rpc("report_app_activity", { target: workspace })
    return new NextResponse(null, { status: result.error ? 503 : 204, headers })
  } catch { return new NextResponse(null, { status: 503, headers }) }
}
