import { redirectSignedInUser } from "@/lib/auth"
import Link from "next/link"
import { AuthForm } from "@/components/auth/auth-form"
import { supabaseConfigured } from "@/lib/supabase/config"
import { invitationContext } from "@/lib/workspace-session"
import { cancelInvitation } from "@/app/actions/workspaces"
export const metadata = { title: "Create account" }
export const dynamic = "force-dynamic"
export default async function Signup() {
  await redirectSignedInUser()
  const invited = Boolean(await invitationContext())
  return (
    <>
      <p className="mb-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">
        A fresh start
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Make yourself at home.
      </h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
        {invited
          ? "Create your account using the invited email address to join the workspace."
          : "Create your account. Your personal workspace will be ready when you are."}
      </p>
      <AuthForm
        mode="signup"
        configured={supabaseConfigured()}
      />
      {invited && (
        <form action={cancelInvitation} className="mt-4">
          <button
            className="text-xs text-muted-foreground underline"
            type="submit"
          >
            Continue without this invitation
          </button>
        </form>
      )}
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </>
  )
}
