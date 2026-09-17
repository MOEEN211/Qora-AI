import sharp from "sharp"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return new Response(null, { status: 404, headers })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email_confirmed_at)
    return new Response(null, { status: 401, headers })
  const { data, error } = await supabase
    .from("workspace_logos")
    .select("image_data")
    .eq("org_id", id)
    .maybeSingle()
  if (error) return new Response(null, { status: 503, headers })
  if (!data) return new Response(null, { status: 404, headers })
  try {
    const bytes = Buffer.from(data.image_data.slice(2), "hex")
    const metadata = await sharp(bytes, {
      limitInputPixels: 25_000_000,
    }).metadata()
    if (
      metadata.format !== "webp" ||
      metadata.width !== 256 ||
      metadata.height !== 256
    )
      return new Response(null, { status: 404, headers })
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Type": "image/webp" },
    })
  } catch {
    return new Response(null, { status: 404, headers })
  }
}
