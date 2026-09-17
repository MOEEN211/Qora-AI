import { notFound, redirect } from "next/navigation"
import { authorizationId } from "@/lib/integrations/schema"
import { createClient } from "@/lib/supabase/server"
import { getWorkspace } from "@/lib/auth"
import config from "@/config/integrations.json"
import { site } from "@/config/site"
import { ConsentForm } from "@/components/integrations/consent"
import { AuthForm } from "@/components/auth/auth-form"
export const dynamic = "force-dynamic"
export const metadata = {
  title: "Connect an application",
  referrer: "strict-origin" as const,
}
export default async function Consent({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>
}) {
  if (!config.mcpEnabled || !config.oauthEnabled) notFound()
  const id = authorizationId.safeParse((await searchParams).authorization_id)
  const frame = (children: React.ReactNode) => (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-5">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-7 shadow-sm sm:p-10">
        <p className="mb-6 text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {site.name} · Connections
        </p>
        {children}
      </section>
    </main>
  )
  if (!id.success)
    return frame(
      <>
        <h1 className="text-2xl font-semibold">Invalid connection request</h1>
        <p className="mt-4 text-muted-foreground">
          Start the connection again in your assistant.
        </p>
      </>
    )
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user)
    return frame(
      <>
        <h1 className="mb-6 text-2xl font-semibold">Sign in to connect</h1>
        <AuthForm
          mode="login"
          configured
          authorizationId={id.data}
        />
      </>
    )
  if (!user.email_confirmed_at) redirect("/verify-email")
  const result = await supabase.auth.oauth.getAuthorizationDetails(id.data)
  if (result.error || !result.data)
    return frame(
      <>
        <h1 className="text-2xl font-semibold">Connection request expired</h1>
        <p className="mt-4 text-muted-foreground">
          Start again in your assistant to request access.
        </p>
      </>
    )
  if (!("authorization_id" in result.data)) redirect(result.data.redirect_url)
  const details = result.data
  const { workspaces } = await getWorkspace()
  const allowed = workspaces.filter(
    (w) => w.role === "owner" || w.role === "admin"
  )
  return frame(
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        Connect {details.client.name}?
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Choose the workspace this application can access. You can disconnect it
        at any time in Settings.
      </p>
      <p className="mt-4 rounded-lg bg-muted p-3 text-xs break-all">
        Return address: {details.redirect_uri}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Identity permissions requested: {details.scope || "account identifier"}
      </p>
      {!allowed.length && (
        <p role="alert" className="mt-4 text-sm">
          You need an owner or admin role to connect a workspace.
        </p>
      )}
      <ConsentForm authorizationId={id.data} workspaces={allowed} />
    </>
  )
}
