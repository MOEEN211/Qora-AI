import { publicBlogPosts } from "@/lib/seo/content"
import { absoluteUrl } from "@/lib/seo/metadata"
import { markdownResponse } from "@/lib/seo/markdown"
import { site } from "@/config/site"

export const dynamic = "force-dynamic"

export async function GET() {
  const posts = await publicBlogPosts()
  return markdownResponse(
    `# ${site.name} blog\n\n` +
      posts
        .map(
          (post) =>
            `- [${post.title}](${absoluteUrl(`/blog/${post.slug}/markdown`)}): ${post.excerpt}`
        )
        .join("\n"),
    "/blog"
  )
}
