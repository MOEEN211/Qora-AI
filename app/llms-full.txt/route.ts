import { docsLlms } from "@/lib/docs-markdown"
import { homeMarkdown } from "@/lib/seo/markdown"

export const dynamic = "force-static"

export async function GET() {
  return new Response(`${homeMarkdown()}\n\n${await docsLlms.full()}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}
