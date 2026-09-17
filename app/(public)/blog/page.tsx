import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BlogCard } from "@/components/marketing/blog-card"
import { getBlogPosts } from "@/lib/blog/queries"
import { site } from "@/config/site"
import { publicMetadata } from "@/lib/seo/metadata"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const page = blogPageNumber((await searchParams).page)
  return publicMetadata({
    title: page === 1 ? "Blog" : `Blog — Page ${page}`,
    description: `Ideas, practical guides, and notes on building with ${site.name}.`,
    path: page === 1 ? "/blog" : `/blog?page=${page}`,
    markdown: "/blog/index.md",
  })
}
function blogPageNumber(raw?: string) {
  return typeof raw === "string" && /^\d{1,5}$/.test(raw)
    ? Math.max(1, Number(raw))
    : 1
}
export const dynamic = "force-dynamic"
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const raw = (await searchParams).page
  const page = blogPageNumber(raw)
  const { posts, hasMore, unavailable } = await getBlogPosts(page)
  return (
    <div className="marketing-container journal-index">
      <header className="journal-heading">
        <span className="journal-eyebrow">The {site.name} journal</span>
        <h1>
          A little perspective.
          <br />
          <span>A better way to build.</span>
        </h1>
        <p>
          Ideas, practical guides, and lessons for the journey
          <br className="journal-desktop-break" /> from your first spark to
          something people love.
        </p>
      </header>
      {posts.length > 0 ? (
        <>
          <div className="journal-section-label">
            <h2>
              {page === 1 ? "Fresh perspectives" : "More from the journal"}
            </h2>
            <span>Thoughtfully built. Openly shared.</span>
          </div>
          {page === 1 ? <BlogCard post={posts[0]} featured /> : null}
          <div className="journal-grid">
            {(page === 1 ? posts.slice(1) : posts).map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        </>
      ) : (
        <div className="journal-empty">
          <h2>
            {unavailable
              ? "The journal is getting ready."
              : "No stories here yet."}
          </h2>
          <p>
            {unavailable
              ? "Check back soon for our first stories."
              : "A new perspective is on its way. Come back soon."}
          </p>
        </div>
      )}
      {page > 1 || hasMore ? (
        <nav className="journal-pagination" aria-label="Blog pages">
          {page > 1 ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link href={page === 2 ? "/blog" : `/blog?page=${page - 1}`} />
              }
            >
              <ArrowLeft /> Newer stories
            </Button>
          ) : (
            <span />
          )}
          <span>Page {page}</span>
          {hasMore ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/blog?page=${page + 1}`} />}
            >
              Older stories <ArrowRight />
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
      <aside className="journal-note">
        <div>
          <span className="journal-eyebrow">Less setup. More possibility.</span>
          <h2>Your next chapter starts here.</h2>
          <p>Bring your idea. Make the foundation your own.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/docs" />} size="lg">
          Explore the docs <ArrowRight />
        </Button>
      </aside>
    </div>
  )
}
