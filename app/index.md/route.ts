import { homeMarkdown, markdownResponse } from "@/lib/seo/markdown"

export const dynamic = "force-static"

export function GET() {
  return markdownResponse(homeMarkdown(), "/")
}
