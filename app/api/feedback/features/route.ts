import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" }
  const url = new URL(request.url)
  const query = url.searchParams.get("q") ?? ""
  const page = Number(url.searchParams.get("page") ?? "0")
  if (query.length > 100 || !Number.isInteger(page) || page < 0 || page > 10000)
    return Response.json({ error: "Invalid search." }, { status: 400, headers })
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user?.email_confirmed_at)
      return Response.json(
        { error: "Please sign in to view feature requests." },
        { status: 401, headers }
      )
    const { data, error } = await supabase.rpc("search_feature_requests", {
      search_term: query,
      page_number: page,
    })
    if (error) throw new Error("Search unavailable")
    return Response.json(data, { headers })
  } catch {
    return Response.json(
      { error: "Feature requests couldn't be loaded. Please try again." },
      { status: 503, headers }
    )
  }
}
