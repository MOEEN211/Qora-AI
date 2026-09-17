import { redirectSignedInUser } from "@/lib/auth"
import Link from "next/link"
import { AuthForm } from "@/components/auth/auth-form"
import { supabaseConfigured } from "@/lib/supabase/config"
import { Alert, AlertDescription } from "@/components/ui/alert"
export const metadata = { title: "Sign in" }
export const dynamic = "force-dynamic"
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; auth?: string }>
}) {
  await redirectSignedInUser()
  const params = await searchParams
  return (
    <>
      <p className="mb-3 text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Welcome back
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Your workspace awaits.
      </h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
        Sign in to pick up where you left off.
      </p>
      {params.account === "deleted" && (
        <Alert role="status" className="mb-6">
          <AlertDescription>Your account has been deleted.</AlertDescription>
        </Alert>
      )}
      {params.auth === "failed" && (
        <Alert variant="destructive" role="alert" className="mb-6">
          <AlertDescription>
            Google sign-in was canceled or could not be completed. Please try
            again or use email.
          </AlertDescription>
        </Alert>
      )}
      <AuthForm
        mode="login"
        configured={supabaseConfigured()}
      />
      <p className="mt-7 text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>
      </p>
      <Link
        href="/verify-email"
        className="mt-5 text-center text-xs text-muted-foreground hover:underline"
      >
        Need a new verification link?
      </Link>
    </>
  )
}
