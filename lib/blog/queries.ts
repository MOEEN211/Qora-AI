import "server-only"
import { cache } from "react"
import { createClient } from "@supabase/supabase-js"
import { supabaseConfig, supabaseConfigured } from "@/lib/supabase/config"
import { blogPostSchema, blogSummarySchema } from "./schema"

// Public editorial content deliberately uses an anonymous publishable-key client.
// Never attach customer cookies or an elevated key to this reader.
function reader() {
  const { url, key } = supabaseConfig()
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
  })
}
const summaryFields =
  "slug,title,excerpt,category,author,thumbnail_path,published_at,reading_minutes"
export const getBlogPosts = cache(async (page = 1) => {
  if (!supabaseConfigured())
    return { posts: [], hasMore: false, unavailable: true }
  const offset = (page - 1) * 9
  const { data, error } = await reader()
    .from("blog_posts")
    .select(summaryFields)
    .order("published_at", { ascending: false })
    .order("slug")
    .range(offset, offset + 9)
  if (error)
    throw new Error(
      "The journal is temporarily unavailable. Please try again shortly."
    )
  return {
    posts: data.slice(0, 9).map((post) => blogSummarySchema.parse(post)),
    hasMore: data.length > 9,
    unavailable: false,
  }
})
export const getBlogPost = cache(async (slug: string) => {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length > 160 ||
    !supabaseConfigured()
  )
    return null
  const { data, error } = await reader()
    .from("blog_posts")
    .select(`${summaryFields},content`)
    .eq("slug", slug)
    .maybeSingle()
  if (error)
    throw new Error(
      "This story is temporarily unavailable. Please try again shortly."
    )
  return data ? blogPostSchema.parse(data) : null
})
