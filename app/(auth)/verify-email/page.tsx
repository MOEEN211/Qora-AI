import Link from "next/link"
import { MailCheck } from "lucide-react"
import { ActionForm } from "@/components/action-form"
import { resendVerification } from "@/app/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabaseConfigured } from "@/lib/supabase/config"
export const metadata = { title: "Check your email" }
export default function Verify() {
  return (
    <>
      <MailCheck className="mb-6 size-9" />
      <h1 className="text-3xl font-semibold tracking-tight">
        Check your inbox.
      </h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
        Open the verification email to activate your account. Check your spam
        folder if you don&apos;t see it.
      </p>
      <ActionForm
        action={resendVerification}
        label="Resend verification email"
        pendingLabel="Requesting email…"
        disabled={!supabaseConfigured()}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            className="h-11"
            name="email"
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
          />
        </div>
      </ActionForm>
      <Link
        href="/login"
        className="mt-7 text-center text-sm underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </>
  )
}
