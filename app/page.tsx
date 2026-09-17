import Link from "next/link"
import Image from "next/image"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Code2,
  Layers,
} from "lucide-react"
import { Testimonials } from "@/components/marketing/testimonials"
import { IncludedFeatures } from "@/components/marketing/included-features"
import { MarketingShell } from "@/components/marketing/shell"
import { FaqList } from "@/components/marketing/faq-list"
import { Pricing } from "@/components/marketing/pricing"
import { getPublicPricing } from "@/lib/billing/public"
import { ProductExplorer } from "@/components/marketing/product-explorer"
import { marketing } from "@/config/marketing"
import { site } from "@/config/site"
import { absoluteUrl, publicMetadata } from "@/lib/seo/metadata"
import { JsonLd } from "@/components/seo/json-ld"
import "./marketing.css"

export const dynamic = "force-dynamic"

export const metadata = publicMetadata({
  title: marketing.title,
  description: marketing.description,
  path: "/",
  markdown: "/index.md",
})

export default async function Home() {
  const pricing = await getPublicPricing()
  return (
    <MarketingShell cookieConsent>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          "@id": absoluteUrl("/#website"),
          name: site.name,
          url: absoluteUrl("/"),
          description: marketing.description,
        }}
      />
      <section
        className="marketing-hero marketing-container"
        aria-labelledby="hero-title"
      >
        <div className="hero-copy">
          <a href="#product" className="hero-eyebrow">
            <span className="mini-brand" aria-hidden="true">
              f.
            </span>{" "}
            Next.js SaaS starter <ArrowRight size={12} />
          </a>
          <h1 id="hero-title">
            Build your SaaS.
            <br />
            <span>Skip the boilerplate.</span>
          </h1>
          <p>{marketing.description}</p>
          <div className="marketing-actions">
            <a className="marketing-button marketing-button-dark" href="#demo">
              Explore the demo <ArrowUpRight size={16} />
            </a>
            <a
              className="marketing-button marketing-button-light"
              href="#product"
            >
              See what’s inside <ArrowDown size={15} />
            </a>
          </div>
          <div className="hero-details">
            <span>
              <Code2 size={13} /> Customizable source code
            </span>
            <span>
              <Layers size={13} /> Your own service accounts
            </span>
          </div>
        </div>
        <ProductExplorer brand={site.name} />
        <div className="marketing-stack">
          <p>
            Built with Next.js, Supabase, Stripe, Resend, Vercel, and shadcn/ui.
          </p>
          <div>
            <span className="stack-next">Next.js</span>
            <span className="stack-supabase">
              <span aria-hidden="true">ϟ</span> Supabase
            </span>
            <span className="stack-stripe">stripe</span>
            <span className="stack-resend" role="img" aria-label="Resend">
              <Image
                src="/brands/resend-wordmark-black.svg"
                alt=""
                width={99}
                height={21}
                className="stack-resend-light"
              />
              <Image
                src="/brands/resend-wordmark-white.svg"
                alt=""
                width={99}
                height={21}
                className="stack-resend-dark"
              />
            </span>
            <span className="stack-vercel">
              <span aria-hidden="true">▲</span> Vercel
            </span>
            <span className="stack-shadcn">
              <span aria-hidden="true">╱╱</span> shadcn/ui
            </span>
          </div>
        </div>
      </section>

      <IncludedFeatures />

      <Testimonials />

      <section
        id="pricing"
        className="marketing-section marketing-container marketing-pricing"
        aria-labelledby="pricing-title"
      >
        <div className="section-heading">
          <span className="marketing-eyebrow">WORKSPACE PRICING</span>
          <h2 id="pricing-title">
            A plan for your business.
            <br />
            <span>Room to make it yours.</span>
          </h2>
          <p>
            Simple monthly or yearly subscriptions, managed right inside your
            workspace.
          </p>
        </div>
        <Pricing {...pricing} />
        <Link
          href="/pricing"
          className="marketing-inline-link pricing-page-link"
        >
          Explore pricing <ArrowRight size={15} />
        </Link>
      </section>

      <section
        id="faq"
        className="marketing-section marketing-container marketing-faq"
        aria-labelledby="faq-title"
      >
        <div className="section-heading">
          <span className="marketing-eyebrow">FAQ</span>
          <h2 id="faq-title">
            Before you
            <br />
            <span>start building.</span>
          </h2>
          <p>What you get, what you need, and how customization works.</p>
          <Link className="marketing-inline-link" href="/faq">
            Explore all FAQs <ArrowUpRight size={14} />
          </Link>
        </div>
        <FaqList items={marketing.faqs} />
      </section>

      <section
        className="marketing-closing marketing-container"
        aria-labelledby="closing-title"
      >
        <div className="closing-mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="marketing-eyebrow">BUILD YOUR SAAS</span>
        <h2 id="closing-title">
          Start with the starter.
          <br />
          <span>Build your product.</span>
        </h2>
        <p>
          Explore the authentication, workspace, and settings flows before you
          build on them.
        </p>
        <div className="marketing-actions">
          <a href="#demo" className="marketing-button marketing-button-dark">
            Explore the demo <ArrowUpRight size={16} />
          </a>
          <Link
            href="/docs"
            className="marketing-button marketing-button-light"
          >
            Read the docs <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </MarketingShell>
  )
}
