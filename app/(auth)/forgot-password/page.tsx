import Link from "next/link"
import { KeyRound } from "lucide-react"
import { ActionForm } from "@/components/action-form"
import { forgotPassword } from "@/app/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabaseConfigured } from "@/lib/supabase/config"
export const metadata = { title: "Reset your password" }
export default function Forgot() {
  return (
    <>
      <KeyRound className="mb-6 size-9" />
      <h1 className="text-3xl font-semibold tracking-tight">
        Let&apos;s get you back in.
      </h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
        Enter the email you used to sign up. We&apos;ll send you a link to reset
        your password.
      </p>
      <ActionForm
        action={forgotPassword}
        label="Send reset link"
        pendingLabel="Requesting link…"
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
