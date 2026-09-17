import Link from "next/link"
import { ActionForm } from "@/components/action-form"
import { confirmEmail } from "@/app/actions/auth"
export const metadata = {
  title: "Confirm your email",
  // Hide the token-bearing path while preserving Origin for native form CSRF checks.
  referrer: "strict-origin" as const,
}
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const token = typeof params.token_hash === "string" ? params.token_hash : ""
  const type = typeof params.type === "string" ? params.type : ""
  const magic = params.flow === "magic"
  const recovery = type === "recovery"
  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">
        {recovery
          ? "Reset your password."
          : magic
            ? "Your workspace awaits."
            : "One last step."}
      </h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
        {recovery
          ? "Continue to choose a new password for your account."
          : magic
            ? "Continue to sign in securely. This link can only be used once."
            : "Confirm your email address to open your workspace."}
      </p>
      <ActionForm
        action={confirmEmail}
        label={
          recovery
            ? "Continue to reset password"
            : magic
              ? "Sign in and continue"
              : "Verify email and continue"
        }
        pendingLabel="Verifying…"
      >
        <input type="hidden" name="token_hash" value={token} />
        <input type="hidden" name="type" value={type} />
        {magic && <input type="hidden" name="flow" value="magic" />}
      </ActionForm>
      <Link
        href={
          recovery ? "/forgot-password" : magic ? "/login" : "/verify-email"
        }
        className="mt-7 text-center text-sm underline underline-offset-4"
      >
        Request a new link
      </Link>
    </>
  )
}
