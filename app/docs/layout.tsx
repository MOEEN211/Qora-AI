import { RootProvider } from "fumadocs-ui/provider/next"
import { DocsLayout } from "fumadocs-ui/layouts/docs"
import { source } from "@/lib/docs-source"
import { site } from "@/config/site"
import { ArrowUpRight, FileJson, BookOpen } from "lucide-react"
import Link from "next/link"
import { publicAccount } from "@/lib/auth"
import { PublicAccountMenu } from "@/components/auth/public-account-menu"
import "./docs.css"
export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  const account = await publicAccount()
  return (
    <RootProvider
      theme={{ enabled: false }}
      search={{ preload: false, options: { api: "/api/docs/search" } }}
    >
      <DocsLayout
        tree={source.pageTree}
        tabs={false}
        containerProps={{ className: "forma-docs" }}
        sidebar={{
          defaultOpenLevel: 1,
          footer: (
            <Link
              href="/docs/guides/documentation"
              className="docs-sidebar-guide"
            >
              <BookOpen aria-hidden="true" size={16} />
              <span>Make these docs your own</span>
              <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          ),
        }}
        nav={{
          title: (
            <span className="docs-brand">
              <span className="brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>{site.name}</span>
              <span className="docs-brand-label">docs</span>
            </span>
          ),
          url: "/docs",
          children: (
            <div className="flex items-center justify-end px-2">
              {account ? (
                <PublicAccountMenu account={account} />
              ) : (
                <Link
                  href="/login"
                  className="rounded-md px-2 py-2 text-sm font-medium whitespace-nowrap hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Sign in
                </Link>
              )}
            </div>
          ),
        }}
        links={[
          {
            text: "OpenAPI schema",
            url: "/api/openapi",
            icon: <FileJson />,
            external: false,
          },
        ]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
