import { notFound } from "next/navigation"
import {
  DocsPage,
  DocsBody,
  DocsTitle,
  DocsDescription,
} from "fumadocs-ui/page"
import { MarkdownCopyButton } from "fumadocs-ui/layouts/docs/page"
import { createRelativeLink } from "fumadocs-ui/mdx"
import { getMDXComponents } from "@/components/docs/mdx"
import { source } from "@/lib/docs-source"
import { publicMetadata, breadcrumbs } from "@/lib/seo/metadata"
import { JsonLd } from "@/components/seo/json-ld"
export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const page = source.getPage((await params).slug)
  if (!page) notFound()
  const MDX = page.data.body
  const markdownUrl = `/api/docs/markdown/${page.slugs.join("/") || "index"}`
  const isHome = page.slugs.length === 0
  return (
    <DocsPage
      toc={page.data.toc}
      full={page.data.full}
      className={isHome ? "docs-home" : "docs-article"}
      tableOfContent={{ style: "clerk" }}
      tableOfContentPopover={{ enabled: !isHome, style: "clerk" }}
    >
      <div className="docs-page-header">
        {!isHome && <JsonLd data={breadcrumbs([{ name: "Documentation", path: "/docs" }, { name: page.data.title, path: page.url }])} />}
        {isHome && <p className="docs-eyebrow">DEVELOPER DOCUMENTATION</p>}
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        {!isHome && (
          <div className="docs-page-actions">
            <MarkdownCopyButton markdownUrl={markdownUrl} />
            <a href={markdownUrl}>View Markdown</a>
          </div>
        )}
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({ a: createRelativeLink(source, page) })}
        />
      </DocsBody>
    </DocsPage>
  )
}
export function generateStaticParams() {
  return source.generateParams()
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const page = source.getPage((await params).slug)
  if (!page) notFound()
  return publicMetadata({ title: page.data.title, description: page.data.description, path: page.url, markdown: `/api/docs/markdown/${page.slugs.join("/") || "index"}` })
}
