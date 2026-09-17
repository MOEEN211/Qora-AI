import { NextRequest, NextResponse } from "next/server"
import { adminRead, operatorStatus } from "@/lib/admin/server"
const headers = { "Cache-Control": "private, no-store" }
export async function GET(request: NextRequest) {
  try {
    const state = await operatorStatus()
    if (!state.verified) return NextResponse.json({ error: "Sign in with an account that has admin access." }, { status: 403, headers })
    const section = request.nextUrl.searchParams.get("section") || "admins"
    if (!["admins", "subscription-history"].includes(section)) return NextResponse.json({ error: "Unknown section" }, { status: 400, headers })
    const id = request.nextUrl.searchParams.get("id")
    if (section === "subscription-history" && (!id || !/^[a-f0-9-]{36}$/.test(id))) return NextResponse.json({ error: "Invalid subscription" }, { status: 400, headers })
    return NextResponse.json(await adminRead(section, id ? { id } : {}), { headers })
  } catch { return NextResponse.json({ error: "Admin access unavailable. Reload and try again." }, { status: 403, headers }) }
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403, headers })
  try {
    if (Number(request.headers.get("content-length") || 0) > 2048) throw new Error()
    const raw = await request.text()
    if (raw.length > 2048) throw new Error()
    const body = JSON.parse(raw)
    if (typeof body.email !== "string" || body.email.length > 254 || typeof body.grant !== "boolean") throw new Error()
    const state = await operatorStatus()
    if (!state.verified) return NextResponse.json({ error: "Sign in with an account that has admin access." }, { status: 403, headers })
    const { data, error } = await state.supabase.rpc("manage_operator", { target_email: body.email, grant_access: body.grant })
    if (error) {
      const message = error.message.includes("last admin") ? "Add another admin before removing the last admin."
        : error.message.includes("confirm this account") || error.message.includes("Account not found") ? "Create and confirm this account before adding it as an admin."
        : "Access could not be changed. Reload and try again."
      return NextResponse.json({ error: message }, { status: 400, headers })
    }
    return NextResponse.json({ ...data, selfRemoved: !body.grant && data?.user_id === state.user.id }, { headers })
  } catch { return NextResponse.json({ error: "Enter a valid account email and try again." }, { status: 400, headers }) }
}
