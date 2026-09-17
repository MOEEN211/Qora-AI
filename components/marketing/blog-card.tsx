import Image from "next/image"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatBlogDate, type BlogSummary } from "@/lib/blog/schema"

export function BlogCard({
  post,
  featured = false,
}: {
  post: BlogSummary
  featured?: boolean
}) {
  return (
    <article
      className={featured ? "journal-card journal-featured" : "journal-card"}
    >
      <Link className="journal-story-link" href={`/blog/${post.slug}`}>
        <div className="journal-art">
          <Image
            src={post.thumbnail_path}
            alt=""
            fill
            sizes={
              featured
                ? "(max-width: 760px) 100vw, 680px"
                : "(max-width: 760px) 100vw, 540px"
            }
            preload={featured}
          />
          <span className="journal-art-label">Forma journal</span>
          <span className="journal-art-arrow">
            <ArrowUpRight size={20} />
          </span>
        </div>
        <div className="journal-card-copy">
          <div className="journal-meta">
            <Badge variant="secondary">{post.category}</Badge>
            <span>{post.reading_minutes} min read</span>
          </div>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <div className="journal-byline">
            <span className="journal-avatar" aria-hidden="true">
              F
            </span>
            <span>
              {post.author}
              <time dateTime={post.published_at}>
                {formatBlogDate(post.published_at)}
              </time>
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
