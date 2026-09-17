import type { MetadataRoute } from "next"
import { seo } from "@/config/seo"
import { source } from "@/lib/docs-source"
import { absoluteUrl } from "@/lib/seo/metadata"
import { publicBlogPosts } from "@/lib/seo/content"

export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!seo.indexable) return []
  const paths = [
    ...seo.pages.map((page) => page.path),
    ...source.getPages().map((page) => page.url),
  ]
  const posts = await publicBlogPosts()
  // Publication is not modification. Omit lastModified until a truthful editorial timestamp exists.
  return [
    ...new Set([...paths, ...posts.map((post) => `/blog/${post.slug}`)]),
  ].map((path) => ({ url: absoluteUrl(path) }))
}
