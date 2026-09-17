import { publicMetadata } from "@/lib/seo/metadata"
import Link from "next/link"
import { ArrowUpRight, BookOpen, MessagesSquare, Mail } from "lucide-react"
import { MarketingShell, PageIntro } from "@/components/marketing/shell"
import { ContactForm } from "@/components/marketing/contact-form"

export const dynamic = "force-dynamic"

export const metadata = publicMetadata({
  path: "/contact",
  title: "Contact",
  description:
    "Have a question about the starter, your workspace, or billing? Get in touch.",
})

export default function ContactPage() {
  const ready = Boolean(
    process.env.CONTACT_TO_EMAIL &&
    process.env.RESEND_API_KEY &&
    process.env.RESEND_FROM_EMAIL
  )
  return (
    <MarketingShell>
      <section className="marketing-container public-page-section contact-page">
        <PageIntro
          eyebrow="CONTACT"
          title="Let’s talk about"
          accent="what you’re building."
        >
          A question, an idea, or a little help getting started. Tell us what’s
          on your mind.
        </PageIntro>
        <div className="contact-layout">
          <aside className="contact-aside">
            <div className="contact-lettermark" aria-hidden="true">
              <Mail size={30} strokeWidth={1.3} />
            </div>
            <h2>
              A conversation{" "}
              <br />
              starts here.
            </h2>
            <p>
              Share a little context so we can point you in the right direction.
              We’ll reply to the email you provide.
            </p>
            <div className="contact-resources">
              <Link href="/docs">
                <BookOpen size={19} />
                <span>
                  <strong>Start with the docs</strong>
                  <small>Setup guides and practical walkthroughs.</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
              <Link href="/faq">
                <MessagesSquare size={19} />
                <span>
                  <strong>A few quick answers</strong>
                  <small>Explore our frequently asked questions.</small>
                </span>
                <ArrowUpRight size={16} />
              </Link>
            </div>
            <span className="contact-aside-note">
              Your next step doesn’t have to be a guess.
            </span>
          </aside>
          <ContactForm ready={ready} />
        </div>
      </section>
    </MarketingShell>
  )
}
