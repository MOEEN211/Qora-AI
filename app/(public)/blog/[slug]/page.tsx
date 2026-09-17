import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getBlogPost } from "@/lib/blog/queries"
import { formatBlogDate } from "@/lib/blog/schema"
import { publicMetadata, absoluteUrl, breadcrumbs } from "@/lib/seo/metadata"
import { JsonLd } from "@/components/seo/json-ld"
import { seo } from "@/config/seo"

export const dynamic = "force-dynamic"
type Props = { params: Promise<{ slug: string }> }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getBlogPost((await params).slug)
  if (!post) return { title: "Story not found", robots: { index: false } }
  return publicMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.thumbnail_path,
    article: { publishedTime: post.published_at, author: post.author },
    markdown: `/blog/${post.slug}/markdown`,
  })
}
export default async function StoryPage({ params }: Props) {
  const post = await getBlogPost((await params).slug)
  if (!post) notFound()
  return (
    <article className="marketing-container journal-article">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.title,
          description: post.excerpt,
          url: absoluteUrl(`/blog/${post.slug}`),
          mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`),
          image: absoluteUrl(post.thumbnail_path),
          datePublished: post.published_at,
          author: { "@type": "Person", name: post.author },
          inLanguage: seo.language,
        }}
      />
      <JsonLd
        data={breadcrumbs([
          { name: "Blog", path: "/blog" },
          { name: post.title, path: `/blog/${post.slug}` },
        ])}
      />
      <Link href="/blog" className="journal-back">
        <ArrowLeft size={15} /> All stories
      </Link>
      <header className="journal-article-heading">
        <div className="journal-meta">
          <Badge variant="secondary">{post.category}</Badge>
          <span>{post.reading_minutes} min read</span>
        </div>
        <h1>{post.title}</h1>
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
      </header>
      <div className="journal-article-art">
        <Image
          src={post.thumbnail_path}
          alt="Forma mark on a soft gray background"
          fill
          preload
          sizes="(max-width: 1120px) 100vw, 1120px"
        />
      </div>
      <div className="journal-reading-layout">
        <nav className="journal-toc" aria-label="On this page">
          <span className="journal-eyebrow">In this story</span>
          {post.content.map((section, i) => (
            <a key={i} href={`#section-${i + 1}`}>
              {section.heading}
            </a>
          ))}
        </nav>
        <div className="journal-prose">
          {post.content.map((section, i) => (
            <section id={`section-${i + 1}`} key={i}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, j) => (
                <p key={j}>{paragraph}</p>
              ))}
            </section>
          ))}
          <div className="journal-article-end">
            <p>Thanks for reading. Keep building something that matters.</p>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/blog" />}
            >
              More from the journal <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </article>
  )
}
