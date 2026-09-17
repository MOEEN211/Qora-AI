"use client"
import Link from "next/link"
import { useActionState, useState } from "react"
import {
  ArrowRight,
  CircleAlert,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react"
import {
  signIn,
  signUp,
  signInWithGoogle,
  sendMagicLink,
} from "@/app/actions/auth"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
export function AuthForm({
  mode,
  configured,
  authorizationId,
}: {
  mode: "login" | "signup"
  configured: boolean
  authorizationId?: string
}) {
  const signup = mode === "signup"
  const [magic, setMagic] = useState(false)
  const [passwordState, passwordAction, passwordPending] = useActionState(
    signup ? signUp : signIn,
    {}
  )
  const [magicState, magicAction, magicPending] = useActionState(
    sendMagicLink,
    {}
  )
  const state = magic ? magicState : passwordState
  const action = magic ? magicAction : passwordAction
  const pending = passwordPending || magicPending
  const [googleState, googleAction, googlePending] = useActionState(
    signInWithGoogle,
    {}
  )
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-5">
      <form action={googleAction} className="space-y-3">
        {authorizationId && (
          <input
            type="hidden"
            name="authorization_id"
            value={authorizationId}
          />
        )}
        <Button
          type="submit"
          variant="outline"
          className="h-11 w-full"
          disabled={pending || googlePending}
          aria-busy={googlePending}
        >
          {googlePending ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
              <path
                fill="currentColor"
                d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.61 0-4.83-1.76-5.62-4.12H3.04v2.59A10 10 0 0 0 12 22ZM6.38 13.93A6 6 0 0 1 6.07 12c0-.67.11-1.32.31-1.93V7.48H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.52l3.34-2.59ZM12 5.95c1.47 0 2.78.51 3.82 1.5l2.86-2.86A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.96 5.48l3.34 2.59C7.17 7.71 9.39 5.95 12 5.95Z"
              />
            </svg>
          )}
          Continue with Google
        </Button>
        {googleState.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{googleState.error}</AlertDescription>
          </Alert>
        )}
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>
      <div
        className="flex rounded-lg bg-muted p-1"
        aria-label="Email sign-in method"
      >
        <Button
          type="button"
          variant={!magic ? "secondary" : "ghost"}
          className={
            !magic
              ? "flex-1 bg-background shadow-sm hover:bg-background"
              : "flex-1"
          }
          aria-pressed={!magic}
          disabled={pending || googlePending}
          onClick={() => setMagic(false)}
        >
          Password
        </Button>
        <Button
          type="button"
          variant={magic ? "secondary" : "ghost"}
          className={
            magic
              ? "flex-1 bg-background shadow-sm hover:bg-background"
              : "flex-1"
          }
          aria-pressed={magic}
          disabled={pending || googlePending}
          onClick={() => setMagic(true)}
        >
          Magic link
        </Button>
      </div>
      <form action={action} className="space-y-5">
        <input type="hidden" name="mode" value={mode} />
        {authorizationId && (
          <input
            type="hidden"
            name="authorization_id"
            value={authorizationId}
          />
        )}
        {signup && (
          <div className="space-y-2">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              className="h-11"
              id="full_name"
              name="full_name"
              autoComplete="name"
              placeholder="Alex Morgan"
              minLength={2}
              maxLength={80}
              defaultValue={state.values?.full_name}
              required
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email address</Label>
          <Input
            className="h-11"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            defaultValue={state.values?.email}
            required
          />
        </div>
        {!magic && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              {!signup && (
                <Link
                  href="/forgot-password"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Forgot password?
                </Link>
              )}
            </div>
            <div className="relative">
              <Input
                className="h-11 pr-11"
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder={
                  signup ? "Create a strong password" : "Enter your password"
                }
                minLength={signup ? 12 : 1}
                maxLength={128}
                required
                aria-describedby={signup ? "password-help" : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1.5 right-1.5"
                onClick={() => setVisible(!visible)}
                aria-label={visible ? "Hide password" : "Show password"}
              >
                {visible ? <EyeOff /> : <Eye />}
              </Button>
            </div>
            {signup && (
              <p id="password-help" className="text-xs text-muted-foreground">
                At least 12 characters. A few memorable words work well.
              </p>
            )}
          </div>
        )}
        {magic && (
          <p className="text-xs leading-5 text-muted-foreground">
            We&apos;ll email you a secure, one-time link. No password needed.
          </p>
        )}
        {state.error && (
          <Alert variant="destructive" role="alert">
            <CircleAlert />
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        {state.success && (
          <Alert role="status">
            <AlertDescription>{state.success}</AlertDescription>
          </Alert>
        )}
        <Button
          className="h-11 w-full"
          type="submit"
          disabled={pending || googlePending || !configured}
          aria-busy={pending}
        >
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          {magic
            ? pending
              ? "Sending link…"
              : "Send magic link"
            : pending
              ? signup
                ? "Creating account…"
                : "Signing in…"
              : signup
                ? "Create account"
                : "Sign in"}{" "}
          {!pending && <ArrowRight className="ml-auto" />}
        </Button>
        {!configured && (
          <p
            className="rounded-md border border-dashed p-3 text-xs leading-5 text-muted-foreground"
            role="status"
          >
            This workspace is not connected yet.{" "}
            {process.env.NODE_ENV === "development" ? (
              <Link
                href="/setup"
                className="font-medium text-foreground underline underline-offset-4"
              >
                View setup steps
              </Link>
            ) : (
              "Please contact the workspace owner."
            )}
          </p>
        )}
      </form>
    </div>
  )
}
