import Link from "next/link"
import { notFound } from "next/navigation"
import { loadTemplates } from "@/scripts/kickstart/templates.mjs"

export const dynamic = "force-dynamic"
export const metadata = { title: "Email previews" }

const labels: Record<string, string> = {
  welcome: "Welcome",
  verification: "Email verification",
  "password-reset": "Password reset",
  "magic-link": "Magic link",
  "workspace-invitation": "Workspace invitation",
}

export default async function EmailPreviews({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>
}) {
  if (process.env.NODE_ENV !== "development") notFound()
  const { template } = await searchParams
  const templates = await loadTemplates(process.cwd(), {
    APP_NAME: process.env.APP_NAME || "Forma",
    SUPABASE_PROJECT_REF: "preview",
    RESEND_FROM_EMAIL: "hello@example.com",
  })
  const selected =
    templates.find((item) => item.kind === template) || templates[0]
  const exampleUrl =
    selected.kind === "welcome"
      ? "https://example.com/dashboard"
      : selected.kind === "workspace-invitation"
        ? "https://example.com/invite#token=sample"
        : `https://example.com/auth/confirm?token_hash=sample&amp;type=${selected.kind === "password-reset" ? "recovery" : "email"}${selected.kind === "magic-link" ? "&amp;flow=magic" : ""}`
  const html = selected.payload.html
    .replaceAll("{{{WORKSPACE}}}", "Acme Studio")
    .replaceAll("{{{INVITER}}}", "Alex Morgan")
    .replaceAll("{{{ROLE}}}", "Member")
    .replaceAll("{{{EXPIRES}}}", "September 21, 2026")
    .replaceAll('href="{{{ACTION_URL}}}"', 'aria-disabled="true" tabindex="-1"')
    .replaceAll("{{{ACTION_URL}}}", exampleUrl)
    .replace(
      "</head>",
      "<style>a{pointer-events:none;cursor:default}</style></head>"
    )

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Link
        href="/preview"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to app preview
      </Link>
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Your emails, at a glance.
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        The emails your customers will receive. Sample links are inactive;
        nothing is sent.
      </p>
      <nav aria-label="Email templates" className="mt-7 flex flex-wrap gap-2">
        {templates.map((item) => (
          <Link
            key={item.kind}
            href={`/preview/emails?template=${item.kind}`}
            aria-current={selected.kind === item.kind ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${selected.kind === item.kind ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
          >
            {labels[item.kind]}
          </Link>
        ))}
      </nav>
      <section
        aria-label={`${labels[selected.kind]} email preview`}
        className="mt-6 overflow-hidden rounded-xl border bg-card"
      >
        <div className="border-b px-5 py-4 text-sm">
          <span className="mr-3 text-muted-foreground">Subject</span>
          <span className="font-medium">{selected.payload.subject}</span>
        </div>
        <iframe
          title={`${labels[selected.kind]} email`}
          srcDoc={html}
          sandbox=""
          className="block h-[740px] w-full border-0 bg-[#f5f5f4]"
        />
      </section>
      <p className="mt-4 text-xs text-muted-foreground">
        Browser preview. Spacing and fonts can vary slightly between email apps.
      </p>
    </main>
  )
}
