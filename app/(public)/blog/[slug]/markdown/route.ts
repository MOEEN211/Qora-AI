import { getBlogPost } from "@/lib/blog/queries"
import { absoluteUrl } from "@/lib/seo/metadata"
import { markdownResponse } from "@/lib/seo/markdown"

export const dynamic = "force-dynamic"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const post = await getBlogPost((await params).slug)
  if (!post)
    return new Response("Story not found", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex" },
    })
  return markdownResponse(
    [
      `# ${post.title}`,
      post.excerpt,
      `By ${post.author} · ${post.published_at}`,
      `Source: ${absoluteUrl(`/blog/${post.slug}`)}`,
      ...post.content.map(
        (section) =>
          `## ${section.heading}\n\n${section.paragraphs.join("\n\n")}`
      ),
    ].join("\n\n"),
    `/blog/${post.slug}`
  )
}
