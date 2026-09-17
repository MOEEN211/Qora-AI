import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { invitationContext } from "@/lib/workspace-session"
import {
  beginInvitation,
  acceptInvitation,
  cancelInvitation,
} from "@/app/actions/workspaces"
import { ActionForm } from "@/components/action-form"
import { Button } from "@/components/ui/button"
import { InvitationLink } from "@/components/workspaces/invitation-link"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Workspace invitation",
  referrer: "strict-origin" as const,
  robots: { index: false, follow: false },
}
export default async function Invite() {
  const token = await invitationContext()
  if (!token) return <InvitationLink />
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: invitation } =
    token && /^[0-9a-f]{64}$/.test(token)
      ? await supabase.rpc("preview_workspace_invitation", {
          invitation_token: token,
        })
      : { data: null }
  if (!invitation)
    return (
      <div className="space-y-5">
        <InvitationLink hasContext />
        <h1 className="text-3xl font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This link may have expired, been replaced, or been revoked. Ask a
          workspace owner or admin for a new invitation.
        </p>
        <form action={cancelInvitation}>
          <Button type="submit" variant="outline">
            Continue without this invitation
          </Button>
        </form>
        <Link href="/dashboard" className="block text-sm underline">
          Go to your workspace
        </Link>
      </div>
    )
  const matches = user?.email?.toLowerCase() === invitation.email
  return (
    <div className="space-y-6">
      <InvitationLink hasContext />
      <div>
        <p className="mb-3 text-xs tracking-widest text-muted-foreground uppercase">
          Workspace invitation
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Join {invitation.workspace}
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          {invitation.inviter || "A workspace administrator"} invited you to
          join as <span className="capitalize">{invitation.role}</span>.
        </p>
        <p className="mt-2 text-sm break-all">For {invitation.email}</p>
      </div>
      {matches && user?.email_confirmed_at ? (
        <ActionForm
          action={acceptInvitation}
          label={invitation.accepted ? "Open workspace" : "Accept invitation"}
        >
          <input type="hidden" name="token" value={token} />
        </ActionForm>
      ) : (
        <>
          {user && !matches && (
            <p className="text-sm text-muted-foreground">
              You are signed in as {user.email}. Switch accounts to use the
              invited email address.
            </p>
          )}
          {matches && !user?.email_confirmed_at && (
            <p className="text-sm text-muted-foreground">
              Verify your email before entering the workspace.
            </p>
          )}
          <form action={beginInvitation} className="flex flex-wrap gap-3">
            <input type="hidden" name="token" value={token} />
            <Button name="mode" value={user ? "switch" : "login"} type="submit">
              {user ? "Switch account" : "Sign in to accept"}
            </Button>
            {!user && (
              <Button
                name="mode"
                value="signup"
                variant="outline"
                type="submit"
              >
                Create account
              </Button>
            )}
          </form>
        </>
      )}
    </div>
  )
}
