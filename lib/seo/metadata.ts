import type { Metadata } from "next"
import { site } from "@/config/site"
import { seo } from "@/config/seo"

export const absoluteUrl = (path: string) =>
  new URL(path, seo.origin).toString()

export function publicMetadata({
  title,
  description = site.description,
  path,
  image = seo.socialImage,
  article,
  markdown,
}: {
  title: string
  description?: string
  path: string
  image?: string
  article?: { publishedTime: string; author: string }
  markdown?: string
}): Metadata {
  const fullTitle = `${title} · ${site.name}`
  const images = [{ url: absoluteUrl(image), alt: title }]
  return {
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical: absoluteUrl(path),
      ...(markdown
        ? { types: { "text/markdown": absoluteUrl(markdown) } }
        : {}),
    },
    robots: { index: seo.indexable, follow: true },
    openGraph: {
      title: fullTitle,
      description,
      url: absoluteUrl(path),
      siteName: site.name,
      locale: seo.locale,
      images,
      ...(article
        ? {
            type: "article",
            publishedTime: article.publishedTime,
            authors: [article.author],
          }
        : { type: "website" }),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images,
    },
  }
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}
