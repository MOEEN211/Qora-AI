import { createClient } from "@/lib/supabase/server"
import { getNotificationSummary } from "@/lib/notifications-server"

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    if (error || !user?.email_confirmed_at)
      return Response.json(
        { error: "Please sign in to view notifications." },
        { status: 401, headers }
      )
    const result = await getNotificationSummary()
    return Response.json(result, { status: result.error ? 503 : 200, headers })
  } catch {
    return Response.json(
      { error: "Notifications couldn’t be loaded. Please try again." },
      { status: 503, headers }
    )
  }
}
