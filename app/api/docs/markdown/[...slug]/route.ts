import { source } from "@/lib/docs-source"
import { docsLlms } from "@/lib/docs-markdown"
import { markdownResponse } from "@/lib/seo/markdown"

export const dynamic = "force-static"

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ slug: string[] }>
  }
) {
  const { slug } = await params
  const page = source.getPage(
    slug.length === 1 && slug[0] === "index" ? [] : slug
  )
  if (!page)
    return new Response("Documentation page not found", { status: 404 })
  return markdownResponse(await docsLlms.page(page), page.url)
}

export function generateStaticParams() {
  return source
    .generateParams()
    .map(({ slug }) => ({ slug: slug.length ? slug : ["index"] }))
}
