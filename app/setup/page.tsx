import Link from "next/link"
import { notFound } from "next/navigation"
import { Brand } from "@/components/brand"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
export const dynamic = "force-dynamic"
export default function Setup() {
  if (process.env.NODE_ENV !== "development") notFound()
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-12">
      <Brand href="/login" />
      <div>
        <p className="mb-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Development setup
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Connect your own workspace.
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Start with three credentials. Kickstart connects your database,
          authentication, email, and sandbox billing.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Before your first signup</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-5 pl-5 text-sm leading-6">
            <li>
              Create your Supabase, Resend, and Stripe accounts. You do not
              need to create a Supabase project yourself.
            </li>
            <li>
              Copy <code>.env.example</code> to <code>.env</code>. Fill in
              <code> SUPABASE_ACCESS_TOKEN</code>, <code>RESEND_API_KEY</code>,
              and <code>STRIPE_TEST_SECRET_KEY</code> with your sandbox key.
            </li>
            <li>
              Run <code>npm run kickstart:check</code> to check account access.
              Project-specific checks run after the new project exists.
            </li>
            <li>
              Run <code>npm run kickstart</code>. It creates a US-hosted
              project and fills in the remaining provider settings. Restart
              this development server afterward.
            </li>
            <li>
              Create an account to open your workspace. If you enable email
              verification in your settings, confirm your email first.
            </li>
          </ol>
        </CardContent>
      </Card>
      <div className="flex gap-3">
        <Link href="/login" className={buttonVariants()}>
          View sign in
        </Link>
        <Link
          href="/preview"
          className={buttonVariants({ variant: "outline" })}
        >
          Preview dashboard
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Email uses a verified Resend domain when available. Otherwise, test
        emails go only to your Resend account inbox. Supabase stays hosted.
      </p>
    </main>
  )
}
