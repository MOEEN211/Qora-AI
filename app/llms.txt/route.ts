import { llmsIndex } from "@/lib/seo/markdown"

export const dynamic = "force-static"

export async function GET() {
  return new Response(llmsIndex(), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
