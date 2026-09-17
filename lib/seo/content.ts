import "server-only"
import { getBlogPosts } from "@/lib/blog/queries"
import type { BlogSummary } from "@/lib/blog/schema"

// Reuse the public anonymous reader and its publication RLS, never an admin client.
export async function publicBlogPosts() {
  const posts: BlogSummary[] = []
  for (let page = 1; page <= 5000; page++) {
    const result = await getBlogPosts(page)
    posts.push(...result.posts)
    if (!result.hasMore) return posts
  }
  throw new Error(
    "Split the sitemap before publishing more than 45,000 blog posts."
  )
}
