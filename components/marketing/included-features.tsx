import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Code2,
  CreditCard,
  FileCode2,
  Globe,
  Layers,
  MessageSquare,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react"
import type { ReactNode } from "react"
import Link from "next/link"

function ProductWindow({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="included-window">
      <div className="included-window-bar">
        <span className="included-window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>{title}</span>
        <MoreHorizontal size={16} />
      </div>
      {children}
    </div>
  )
}

function WorkspaceVisual() {
  return (
    <ProductWindow title="Workspace">
      <div className="included-workspace-heading">
        <span className="included-app-icon">
          <Layers size={20} />
        </span>
        <div>
          <strong>Acme Studio</strong>
          <small>Your team, together.</small>
        </div>
        <ChevronDown size={15} />
      </div>
      <div className="included-mini-tabs">
        <span>General</span>
        <span data-selected>Team</span>
        <span>Advanced</span>
      </div>
      <div className="included-people">
        {[
          { initials: "JD", name: "Jamie Davis", role: "Owner" },
          { initials: "AL", name: "Alex Lee", role: "Admin" },
          { initials: "SK", name: "Sam Kim", role: "Member" },
        ].map((member) => (
          <div className="included-person" key={member.initials}>
            <span className="included-avatar">{member.initials}</span>
            <strong>{member.name}</strong>
            <span className="included-pill">{member.role}</span>
          </div>
        ))}
      </div>
      <div className="included-window-footer">
        <ShieldCheck size={14} /> A separate space for every team
      </div>
    </ProductWindow>
  )
}

function ChatVisual() {
  return (
    <ProductWindow title="AI chatbot">
      <div className="included-chat">
        <div className="included-chat-question">
          Help me plan my next product launch.
        </div>
        <div className="included-chat-answer">
          <span className="included-app-icon">
            <Sparkles size={18} />
          </span>
          <div>
            <strong>Let’s turn your idea into a plan.</strong>
            <p>
              Start with your audience, define the first release, and make a
              little room for feedback.
            </p>
            <span className="included-chat-cursor" />
          </div>
        </div>
        <div className="included-chat-compose">
          <span>Ask a follow-up…</span>
          <span className="included-send">
            <ArrowUp size={16} />
          </span>
        </div>
        <div className="included-chat-details">
          <MessageSquare size={12} /> Saved conversations{" "}
          <span>Streaming responses</span>
        </div>
      </div>
    </ProductWindow>
  )
}

function IntegrationsVisual() {
  return (
    <ProductWindow title="Integrations">
      <div className="included-integrations">
        <div className="included-connection">
          <span className="included-app-icon">
            <Code2 size={20} />
          </span>
          <div>
            <strong>REST API</strong>
            <small>Build on your workspace</small>
          </div>
          <span className="included-pill">API key</span>
        </div>
        <div className="included-endpoint">
          <span>GET</span>
          <code>/api/v1/workspace</code>
          <span>200</span>
        </div>
        <div className="included-connection">
          <span className="included-app-icon">
            <Globe size={20} />
          </span>
          <div>
            <strong>MCP</strong>
            <small>Connect your AI tools</small>
          </div>
          <span className="included-pill">OAuth</span>
        </div>
        <div className="included-tool-list">
          <span>
            <Check size={13} /> Read details
          </span>
          <span>
            <Check size={13} /> Rename workspace
          </span>
        </div>
      </div>
      <div className="included-window-footer">
        <ShieldCheck size={14} /> Access scoped to your workspace
      </div>
    </ProductWindow>
  )
}

function BillingVisual() {
  return (
    <ProductWindow title="Subscription billing">
      <div className="included-billing">
        <div className="included-connection">
          <span className="included-app-icon">
            <CreditCard size={20} />
          </span>
          <div>
            <strong>Workspace subscription</strong>
            <small>Acme Studio</small>
          </div>
        </div>
        <div className="included-billing-flow">
          <span>
            <Check size={14} /> Checkout
          </span>
          <ArrowRight size={14} />
          <span>
            <Check size={14} /> Subscribed
          </span>
        </div>
        <div className="included-billing-line">
          <span>Billing interval</span>
          <strong>Monthly / Yearly</strong>
        </div>
        <div className="included-billing-line">
          <span>Payment provider</span>
          <strong>Stripe</strong>
        </div>
        <div className="included-portal">
          Customer portal <ArrowRight size={15} />
        </div>
      </div>
    </ProductWindow>
  )
}

function AgentVisual() {
  return (
    <ProductWindow title="Your coding agent">
      <div className="included-agent">
        <div className="included-agent-prompt">
          <Sparkles size={17} />
          <p>
            Add a client portal to my app. Use the existing workspaces and
            permissions.
          </p>
        </div>
        <div className="included-agent-context">
          <FileCode2 size={14} /> Project instructions <span>+</span> Your
          source code
        </div>
        <div className="included-agent-plan">
          <small>EXAMPLE BUILD PLAN</small>
          <div>
            <Plus size={14} /> Create the client portal pages
          </div>
          <div>
            <Plus size={14} /> Extend the workspace data model
          </div>
          <div>
            <ShieldCheck size={14} /> Verify access across workspaces
          </div>
        </div>
        <div className="included-window-footer">
          <Code2 size={14} /> Your foundation. Your next feature.
        </div>
      </div>
    </ProductWindow>
  )
}

const features = [
  {
    id: "workspaces",
    title: "Workspaces & authentication",
    description:
      "Sign-in, team access, and account settings, connected through Supabase.",
    bullets: [
      "Email/password and magic-link sign-in",
      "Google OAuth — configure your Supabase provider",
      "Multiple workspaces, invitations, and team roles",
      "Profile photos, workspace logos, and notification preferences",
    ],
    href: "/#demo",
    link: "Explore the workspace",
    visual: WorkspaceVisual,
    label:
      "Sample workspace showing three teammates with owner, admin, and member roles",
  },
  {
    id: "ai-chat",
    title: "AI chatbot & infrastructure",
    description: "A working chatbot you can customize or remove.",
    bullets: [
      "Streaming chat with Vercel AI SDK",
      "Choose your OpenRouter model in configuration",
      "Saved conversations and searchable chat history",
      "Workspace credits and token/cost tracking",
    ],
    href: "/#demo",
    link: "Explore the AI demo",
    visual: ChatVisual,
    label:
      "Illustrated AI conversation with a streaming response and follow-up composer",
  },
  {
    id: "integrations",
    title: "API & MCP",
    description: "Connect external apps and AI tools to your product.",
    bullets: [
      "REST API and MCP server with workspace examples",
      "Workspace API keys with read/write permissions",
      "OAuth connections, token refresh, and revocation",
      "OpenAPI reference and public documentation",
    ],
    href: "/docs/api",
    link: "Explore the integrations",
    visual: IntegrationsVisual,
    label:
      "REST API and MCP illustration showing workspace-scoped access and example operations",
  },
  {
    id: "subscriptions",
    title: "Subscription payments",
    description: "Subscription billing for each workspace, powered by Stripe.",
    bullets: [
      "Stripe Checkout and customer portal",
      "Monthly and yearly workspace plans",
      "Plan changes, invoices, and cancellation",
      "Webhook synchronization and test/live setup",
    ],
    href: "/pricing",
    link: "Explore subscription plans",
    visual: BillingVisual,
    label:
      "Illustrated subscription flow from Stripe Checkout to a workspace subscription and customer portal",
  },
  {
    id: "coding-agent",
    title: "Build with your AI agent",
    description:
      "Give your coding agent source code and clear project context.",
    bullets: [
      "Next.js and TypeScript source code",
      "61 installed shadcn/ui components",
      "AGENTS.md instructions and architecture docs",
      "Kickstart setup and customization guides",
    ],
    href: "/docs",
    link: "Explore the documentation",
    visual: AgentVisual,
    label:
      "Example coding-agent prompt and proposed plan for extending the starter with a client portal",
  },
]

export function IncludedFeatures() {
  return (
    <section
      id="product"
      className="marketing-section marketing-container included-section"
      aria-labelledby="product-title"
    >
      <div className="section-heading">
        <span className="marketing-eyebrow">WHAT’S INCLUDED</span>
        <h2 id="product-title">
          The foundation is here.
          <br />
          <span>Make the product yours.</span>
        </h2>
        <p>
          From your first customer to your next feature. Start with the systems
          your SaaS needs, already connected and ready to customize.
        </p>
      </div>
      <div className="included-features">
        {features.map(
          ({
            id,
            title,
            description,
            bullets,
            href,
            link,
            visual: Visual,
            label,
          }) => (
            <article
              key={id}
              className="included-row"
              aria-labelledby={`included-${id}`}
            >
              <div className="included-visual" role="img" aria-label={label}>
                <div aria-hidden="true">
                  <Visual />
                </div>
              </div>
              <div className="included-copy">
                <h3 id={`included-${id}`}>{title}</h3>
                <p>{description}</p>
                <ul className="included-bullets" role="list">
                  {bullets.map((bullet) => (
                    <li key={bullet}>
                      <Check size={16} aria-hidden="true" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
                <Link href={href} className="marketing-inline-link">
                  {link}
                  <ArrowRight size={15} />
                </Link>
              </div>
            </article>
          )
        )}
      </div>
    </section>
  )
}
