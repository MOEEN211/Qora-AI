import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Brand } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarketingNavigation } from "./navigation"
import { CookieConsent } from "./cookie-consent"
import { marketing } from "@/config/marketing"
import { site } from "@/config/site"
import { publicAccount } from "@/lib/auth"
import "@/app/marketing.css"

const footerGroups = [
  {
    title: "Product",
    links: [
      { label: "Overview", href: "/#product" },
      { label: "Pricing", href: "/pricing" },
      { label: "FAQs", href: "/faq" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "Getting started", href: "/docs/getting-started/setup" },
      { label: "API reference", href: "/docs/api" },
      { label: "MCP guide", href: "/docs/mcp" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
]

export async function MarketingShell({
  children,
  cookieConsent = false,
}: {
  children: ReactNode
  cookieConsent?: boolean
}) {
  const account = await publicAccount()
  return (
    <div className="marketing-page">
      <a href="#main-content" className="marketing-skip-link">
        Skip to content
      </a>
      <header className="marketing-header">
        <div className="marketing-container marketing-header-inner">
          <Brand />
          <MarketingNavigation links={marketing.navigation} account={account} />
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="marketing-footer">
        <div className="marketing-container">
          <div className="footer-main">
            <div className="footer-brand">
              <Brand />
              <p>Your next idea starts here.</p>
              <span>
                The Next.js SaaS starter with the essentials already connected.
                Build the part that makes it yours.
              </span>
              <Link
                className="footer-brand-link"
                href="/docs/getting-started/quickstart"
              >
                Start building <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <nav className="footer-navigation" aria-label="Footer">
              {footerGroups.map((group) => (
                <div className="footer-group" key={group.title}>
                  <h2>{group.title}</h2>
                  <ul role="list">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href}>{link.label}</Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>
          <div className="footer-bottom">
            <small>
              © {new Date().getFullYear()} {site.name}. All rights reserved.
            </small>
            <div className="footer-utilities">
              <nav className="footer-legal" aria-label="Legal">
                <Link href="/privacy">Privacy policy</Link>
                <Link href="/terms">Terms of service</Link>
              </nav>
              {cookieConsent && <CookieConsent />}
              <div className="footer-theme">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export function PageIntro({
  eyebrow,
  title,
  accent,
  children,
}: {
  eyebrow: string
  title: string
  accent: string
  children: ReactNode
}) {
  return (
    <div className="public-page-intro">
      <span className="marketing-eyebrow">{eyebrow}</span>
      <h1>
        {title}
        <br />
        <span>{accent}</span>
      </h1>
      <p>{children}</p>
    </div>
  )
}
