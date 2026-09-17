"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { supabaseConfigured } from "@/lib/supabase/config"
import { requireUser } from "@/lib/auth"
import type { ActionState } from "@/lib/form-state"
import { sendWelcome } from "@/lib/email/server"
import { cookies } from "next/headers"
import type { User } from "@supabase/supabase-js"
import {
  invitationContext,
  clearInvitationContext,
} from "@/lib/workspace-session"

import {
  authDestination,
  rememberAuthContinuation,
} from "@/lib/auth-destination"
import { googleAvailable } from "@/lib/auth-providers"

const emailSchema = z.email().max(254)
const passwordSchema = z.string().min(12).max(128)
const unavailable = {
  error: "Sign-in is not available yet. Please contact the workspace owner.",
}
const emailOf = (form: FormData) =>
  String(form.get("email") || "")
    .trim()
    .toLowerCase()
function appUrl() {
  const value = process.env.APP_URL
  if (!value)
    throw new Error("APP_URL is required for authentication redirects.")
  return new URL(value).origin
}
function authError(code?: string) {
  if (code === "email_not_confirmed")
    return "Verify your email before signing in. You can request a new link below."
  if (
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit"
  )
    return "Too many attempts. Wait a minute and try again."
  return "We couldn't complete that request. Check your details and try again."
}

export async function signIn(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const email = emailOf(form)
  const password = String(form.get("password") || "")
  if (
    !emailSchema.safeParse(email).success ||
    !password ||
    password.length > 128
  )
    return { error: "Enter a valid email and password.", values: { email } }
  if (!supabaseConfigured()) return unavailable
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error)
      return {
        error:
          error.code === "invalid_credentials"
            ? "The email or password is incorrect."
            : authError(error.code),
        values: { email },
      }
  } catch {
    return {
      error: "We couldn't reach the sign-in service. Please try again.",
      values: { email },
    }
  }
  await rememberAuthContinuation(form.get("authorization_id"))
  redirect(await authDestination())
}

export async function signUp(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const email = emailOf(form)
  const full_name = String(form.get("full_name") || "").trim()
  const password = String(form.get("password") || "")
  const values = { email, full_name }
  let hasSession = false
  let signedUpUser: User | undefined
  const invitation = await invitationContext()
  if (
    !emailSchema.safeParse(email).success ||
    full_name.length < 2 ||
    full_name.length > 80 ||
    !passwordSchema.safeParse(password).success
  )
    return {
      error:
        "Use your name, a valid email, and a password between 12 and 128 characters.",
      values,
    }
  if (!supabaseConfigured()) return unavailable
  try {
    const supabase = await createClient()
    if (invitation) {
      const preview = await supabase.rpc("preview_workspace_invitation", {
        invitation_token: invitation,
      })
      if (preview.error || !preview.data || preview.data.email !== email)
        return {
          error:
            "This invitation is unavailable or belongs to a different email. Open the invitation to continue.",
          values,
        }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          ...(invitation ? { workspace_invitation: invitation } : {}),
        },
        emailRedirectTo: `${appUrl()}/auth/confirm`,
      },
    })
    if (error) return { error: authError(error.code), values }
    // Supabase's installed setting is authoritative; .env alone cannot bypass it.
    hasSession = Boolean(data.session && data.user?.email_confirmed_at)
    signedUpUser = data.user || undefined
    if (hasSession && data.user) await sendWelcome(data.user)
  } catch {
    return {
      error: "We couldn't create your account right now. Please try again.",
      values,
    }
  }
  redirect(hasSession ? await authDestination(signedUpUser) : "/verify-email")
}

export async function resendVerification(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const email = emailOf(form)
  if (!emailSchema.safeParse(email).success)
    return { error: "Enter a valid email address." }
  if (!supabaseConfigured()) return unavailable
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${appUrl()}/auth/confirm` },
    })
    if (error && error.status === 429)
      return { error: authError("over_email_send_rate_limit") }
    return {
      success:
        "If your account needs verification, a new link is on its way. Check your inbox and spam folder.",
    }
  } catch {
    return { error: "We couldn't reach the email service. Try again shortly." }
  }
}

export async function signInWithGoogle(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  if (!supabaseConfigured()) return unavailable
  // OAuth cannot carry the validated invitation credential into Auth's insertion
  // trigger. Never silently create a personal workspace for an invited signup.
  if (await invitationContext())
    return {
      error:
        "Use your invited email with a magic link or password to join this workspace. You can use Google after creating your account.",
    }
  let url: string | undefined
  try {
    if (!(await googleAvailable()))
      return { error: "Google sign-in is not available yet. Please use email." }
    await rememberAuthContinuation(form.get("authorization_id"))
    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${appUrl()}/auth/callback`,
        queryParams: { prompt: "select_account" },
      },
    })
    if (error || !data.url)
      return { error: "We couldn't start Google sign-in. Please try again." }
    url = data.url
  } catch {
    return { error: "We couldn't reach Google sign-in. Please try again." }
  }
  redirect(url)
}

export async function sendMagicLink(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const email = emailOf(form)
  const signup = form.get("mode") === "signup"
  const full_name = String(form.get("full_name") || "").trim()
  const values = { email, full_name }
  if (
    !emailSchema.safeParse(email).success ||
    (signup && (full_name.length < 2 || full_name.length > 80))
  )
    return {
      error: signup
        ? "Enter your full name and a valid email address."
        : "Enter a valid email address.",
      values,
    }
  if (!supabaseConfigured()) return unavailable
  try {
    const supabase = await createClient()
    const invitation = await invitationContext()
    if (invitation) {
      const preview = await supabase.rpc("preview_workspace_invitation", {
        invitation_token: invitation,
      })
      if (preview.error || !preview.data || preview.data.email !== email)
        return {
          error:
            "This invitation is unavailable or belongs to a different email. Open the invitation to continue.",
          values,
        }
    }
    await rememberAuthContinuation(form.get("authorization_id"))
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: signup,
        emailRedirectTo: `${appUrl()}/auth/confirm?flow=magic`,
        ...(signup
          ? {
              data: {
                full_name,
                ...(invitation ? { workspace_invitation: invitation } : {}),
              },
            }
          : {}),
      },
    })
    if (error) {
      // Login must not disclose whether an address has an account.
      if (!signup && error.code === "otp_disabled")
        return {
          success:
            "If an account exists for this email, a sign-in link is on its way. Check your inbox and spam folder.",
          values,
        }
      return { error: authError(error.code), values }
    }
    return {
      success: signup
        ? "Check your inbox for a link to finish creating your account. You won't need a password."
        : "If an account exists for this email, a sign-in link is on its way. Check your inbox and spam folder.",
      values,
    }
  } catch {
    return {
      error: "We couldn't send your sign-in link. Please try again shortly.",
      values,
    }
  }
}

export async function forgotPassword(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const email = emailOf(form)
  if (!emailSchema.safeParse(email).success)
    return { error: "Enter a valid email address." }
  if (!supabaseConfigured()) return unavailable
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl()}/auth/confirm`,
    })
    if (error && error.status === 429)
      return { error: authError("over_email_send_rate_limit") }
    return {
      success:
        "If an account exists for that email, you'll receive a password reset link shortly.",
    }
  } catch {
    return { error: "We couldn't reach the email service. Try again shortly." }
  }
}

export async function confirmEmail(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const token_hash = String(form.get("token_hash") || "")
  const type = String(form.get("type") || "")
  let confirmedUser: User | undefined
  if (
    !token_hash ||
    token_hash.length > 512 ||
    !["email", "recovery"].includes(type)
  )
    return { error: "This link isn't valid. Request a new one and try again." }
  if (!supabaseConfigured()) return unavailable
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash,
      type: type as "email" | "recovery",
    })
    if (error)
      return {
        error:
          "This link has expired or was already used. Request a new one below.",
      }
    if (
      type === "email" &&
      data.user?.email_confirmed_at &&
      (form.get("flow") !== "magic" ||
        Date.now() - Date.parse(data.user.created_at) < 3_600_000)
    )
      await sendWelcome(data.user)
    confirmedUser = data.user || undefined
  } catch {
    return { error: "We couldn't verify this link. Please try again." }
  }
  redirect(
    type === "recovery"
      ? "/reset-password"
      : await authDestination(confirmedUser)
  )
}

export async function resetPassword(
  _: ActionState,
  form: FormData
): Promise<ActionState> {
  const { supabase } = await requireUser()
  const password = String(form.get("password") || "")
  if (!passwordSchema.safeParse(password).success)
    return { error: "Choose a password between 12 and 128 characters." }
  if (password !== form.get("confirm_password"))
    return { error: "Your passwords don't match." }
  const { error } = await supabase.auth.updateUser({ password })
  if (error)
    return {
      error:
        error.code === "same_password"
          ? "Choose a different password from your current one."
          : authError(error.code),
    }
  redirect(await authDestination())
}

export async function signOut() {
  await rememberAuthContinuation(null)
  await clearInvitationContext()
  ;(await cookies()).delete("forma-workspace")
  if (supabaseConfigured()) {
    const supabase = await createClient()
    await supabase.auth.signOut({ scope: "local" })
  }
  revalidatePath("/", "layout")
  redirect("/login")
}
