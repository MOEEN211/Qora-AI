import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { buildAuthMessage } from "../../supabase/functions/send-auth-email/handler.mjs"

// Token URLs, session cookies and fixture credentials must never appear in traces.
test.use({ trace: "off", screenshot: "off", video: "off" })
test("hosted passwordless signup, scanner-safe confirmation, returning login and replay denial", async ({
  browser,
}) => {
  test.skip(
    process.env.RUN_HOSTED_AUTH !== "true",
    "Explicit hosted auth opt-in required"
  )
  test.setTimeout(180_000)
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (
    !env.APP_URL ||
    !env.SUPABASE_SECRET_KEY ||
    !env.HOSTED_TEST_PROJECT_REF ||
    env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co`
  )
    throw new Error("Dedicated hosted target mismatch")
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const email = `magic-${randomUUID()}@example.invalid`
  let userId: string | undefined
  const contexts = []
  try {
    // Admin generates a real Auth token without emailing an unauthorized inbox.
    // Sending via the form/Resend remains a separate inbox acceptance check.
    const first = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { data: { full_name: "Magic Link Test" } },
    })
    if (first.error || !first.data.user || !first.data.properties)
      throw new Error("Could not generate hosted signup link")
    userId = first.data.user.id
    // Suppress optional welcome delivery for this disposable fixture only.
    const preference = await admin
      .from("notification_preferences")
      .update({ email_enabled: false })
      .eq("user_id", userId)
    if (preference.error)
      throw new Error(
        `Could not suppress fixture welcome email (${preference.error.code || "network error"})`
      )
    const membership = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
    expect(membership.data?.length).toBe(1)
    const origin = new URL(env.APP_URL).origin
    const linkFor = (hash: string) =>
      buildAuthMessage(
        {
          user: { email },
          email_data: { token_hash: hash, email_action_type: "magiclink" },
        },
        {
          FORMA_APP_URL: origin,
          FORMA_RESEND_FROM_EMAIL: env.RESEND_FROM_EMAIL,
          FORMA_RESEND_TEMPLATE_MAGIC_LINK_ID:
            env.RESEND_TEMPLATE_MAGIC_LINK_ID,
        }
      ).template.variables.ACTION_URL
    const link = linkFor(first.data.properties.hashed_token)
    const scanner = await browser.newContext()
    contexts.push(scanner)
    const scannerPage = await scanner.newPage()
    await scannerPage.goto(link)
    await scannerPage.goto(`${origin}/dashboard`)
    await expect(scannerPage).toHaveURL(/\/login$/)
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    await page.goto(link)
    await page.getByRole("button", { name: "Sign in and continue" }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Account menu" })
    ).toBeVisible()
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto(link)
    await page.getByRole("button", { name: "Sign in and continue" }).click()
    await expect(
      page.getByRole("alert").filter({ hasText: "expired or was already used" })
    ).toBeVisible()
    await page.goto(`${origin}/login`)
    await page.getByRole("button", { name: "Magic link", exact: true }).click()
    await page
      .getByLabel("Email address", { exact: true })
      .fill(`absent-${randomUUID()}@example.invalid`)
    await page
      .getByRole("button", { name: "Send magic link", exact: true })
      .click()
    await expect(
      page.getByRole("status").filter({ hasText: "If an account exists" })
    ).toBeVisible()
    if (env.RESEND_TEST_MODE === "true") {
      // The test sender rejects this non-deliverable fixture recipient. Exercise
      // the real signInWithOtp -> hosted hook -> Resend rejection path honestly.
      await page.getByLabel("Email address", { exact: true }).fill(email)
      await page
        .getByRole("button", { name: "Send magic link", exact: true })
        .click()
      await expect(
        page.getByRole("alert").filter({ hasText: "couldn't complete" })
      ).toBeVisible()
    }
    const again = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    })
    if (again.error || !again.data.properties)
      throw new Error("Could not generate returning login link")
    expect(again.data.user.id === userId).toBe(true)
    await page.goto(linkFor(again.data.properties.hashed_token))
    await page.getByRole("button", { name: "Sign in and continue" }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    const after = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
    expect(after.data).toEqual(membership.data)
    await page.goto(`${origin}/dashboard/account`)
    await page.getByRole("tab", { name: "Security", exact: true }).click()
    await page.getByRole("link", { name: "Set a password by email" }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
    const recovery = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    })
    if (recovery.error) throw new Error("Passwordless recovery fixture failed")
    await page.goto(
      `${origin}/auth/confirm?type=recovery&token_hash=${recovery.data.properties.hashed_token}`
    )
    await page
      .getByRole("button", { name: "Continue to reset password" })
      .click()
    const password = `Recovered-${randomUUID()}!`
    await page.getByLabel("New password", { exact: true }).fill(password)
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill(password)
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    const passwordClient = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    if (
      (await passwordClient.auth.signInWithPassword({ email, password })).error
    )
      throw new Error("New password login failed")
    await passwordClient.auth.signOut()
  } finally {
    for (const context of contexts) await context.close()
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId)
      if (removed.error)
        throw new Error("Disposable auth fixture cleanup failed")
    }
  }
})

test("hosted magic-link invited signup creates only the invited membership", async ({
  browser,
}) => {
  test.skip(
    process.env.RUN_HOSTED_AUTH !== "true",
    "Explicit hosted auth opt-in required"
  )
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (
    !env.APP_URL ||
    !env.SUPABASE_SECRET_KEY ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !env.HOSTED_TEST_PROJECT_REF ||
    env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co`
  )
    throw new Error("Dedicated hosted target mismatch")
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    options
  )
  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    options
  )
  const ids: string[] = []
  const context = await browser.newContext()
  const password = `Fixture-${randomUUID()}!`,
    ownerEmail = `magic-owner-${randomUUID()}@example.invalid`,
    email = `magic-invite-${randomUUID()}@example.invalid`
  try {
    const owner = await admin.auth.admin.createUser({
      email: ownerEmail,
      password,
      email_confirm: true,
    })
    if (owner.error) throw new Error("Owner fixture creation failed")
    ids.push(owner.data.user.id)
    if (
      (await client.auth.signInWithPassword({ email: ownerEmail, password }))
        .error
    )
      throw new Error("Owner fixture login failed")
    const membership = await client
      .from("organization_members")
      .select("org_id")
      .eq("user_id", ids[0])
      .single()
    const target = membership.data?.org_id
    if (!target) throw new Error("Fixture workspace missing")
    const invitation = await client.rpc("issue_workspace_invitation", {
      target,
      recipient: email,
      invited_role: "member",
    })
    if (!invitation.data?.token) throw new Error("Fixture invitation failed")
    const page = await context.newPage()
    await context.addCookies([
      {
        name: "forma-invitation",
        value: invitation.data.token,
        url: env.APP_URL,
        httpOnly: true,
        sameSite: "Lax",
      },
    ])
    await page.goto(`${env.APP_URL}/signup`)
    await page.getByRole("button", { name: "Magic link", exact: true }).click()
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Invited Magic Test")
    await page
      .getByLabel("Email address", { exact: true })
      .fill(`mismatch-${randomUUID()}@example.invalid`)
    await page
      .getByRole("button", { name: "Send magic link", exact: true })
      .click()
    await expect(
      page.getByRole("alert").filter({ hasText: "different email" })
    ).toBeVisible()
    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        data: {
          full_name: "Invited Magic Test",
          workspace_invitation: invitation.data.token,
        },
      },
    })
    if (generated.error) throw new Error("Invited magic-link fixture failed")
    ids.push(generated.data.user.id)
    const suppressed = await admin
      .from("notification_preferences")
      .update({ email_enabled: false })
      .eq("user_id", ids[1])
    if (suppressed.error) throw new Error("Fixture welcome suppression failed")
    const rows = await admin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", ids[1])
    expect(rows.data).toEqual([{ org_id: target }])
    await context.clearCookies() // The validated metadata can resume on another browser.
    await page.goto(
      `${env.APP_URL}/auth/confirm?type=email&flow=magic&token_hash=${generated.data.properties.hashed_token}`
    )
    await page.getByRole("button", { name: "Sign in and continue" }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    expect(
      (await context.cookies()).find(
        (cookie) => cookie.name === "forma-workspace"
      )?.value === target
    ).toBe(true)
    expect(
      (
        await admin
          .from("organization_members")
          .select("org_id")
          .eq("user_id", ids[1])
      ).data
    ).toEqual([{ org_id: target }])
  } finally {
    await context.close()
    await client.auth.signOut()
    for (const id of ids.reverse())
      if ((await admin.auth.admin.deleteUser(id)).error)
        throw new Error("Invited auth fixture cleanup failed")
  }
})
