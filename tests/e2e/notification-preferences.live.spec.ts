import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { deliverWelcome } from "../../lib/email/welcome.mjs"
import { deliverInvitation } from "../../lib/email/invitation.mjs"

test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  baseURL: "http://127.0.0.1:3000",
})
test("notification preferences: autosave, email suppression, creation guard and responsive settings", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_HOSTED_NOTIFICATIONS !== "true",
    "Use the explicitly configured hosted test target."
  )
  test.setTimeout(180000)
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (
    !env.SUPABASE_SECRET_KEY ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !env.HOSTED_TEST_PROJECT_REF ||
    env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co`
  )
    throw Error("Dedicated target required")
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    options
  )
  const customer = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    options
  )
  const password = `Preferences-${randomUUID()}!`,
    email = `preferences-${randomUUID()}@example.invalid`
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Preference Tester" },
  })
  if (created.error || !created.data.user)
    throw Error("Fixture creation failed")
  const user = created.data.user
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    expect(
      (await customer.auth.signInWithPassword({ email, password })).error
    ).toBeNull()
    const prefs = () =>
      customer
        .from("notification_preferences")
        .select("email_enabled,in_app_enabled")
        .single()
    expect((await prefs()).data).toEqual({
      email_enabled: true,
      in_app_enabled: true,
    })
    const welcome = await customer
      .from("notifications")
      .select("id")
      .eq("kind", "welcome")
    expect(welcome.data).toHaveLength(1)
    await page.goto("/login")
    await page.getByLabel("Email address", { exact: true }).fill(email)
    await page.getByLabel("Password", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByRole("link", { name: "Settings", exact: true }).click()
    await page.getByRole("tab", { name: "Notifications", exact: true }).click()
    const mail = page.getByRole("switch", {
      name: "Email notifications",
      exact: true,
    })
    const inApp = page.getByRole("switch", {
      name: "In-app notifications",
      exact: true,
    })
    await expect(mail).toBeChecked()
    await expect(inApp).toBeChecked()
    await mail.focus()
    await page.keyboard.press("Space")
    await expect(mail).not.toBeChecked()
    await inApp.click()
    await expect(inApp).not.toBeChecked()
    await expect
      .poll(async () => (await prefs()).data)
      .toEqual({ email_enabled: false, in_app_enabled: false })
    await page.goto("/dashboard/account?tab=notifications")
    await expect(mail).not.toBeChecked()
    await expect(inApp).not.toBeChecked()
    await page.screenshot({
      path: "test-results/notification-preferences-desktop.png",
      fullPage: true,
    })
    let sends = 0
    const guardedFetch: typeof fetch = async (url, init) => {
      if (String(url).startsWith("https://api.resend.com/")) {
        sends++
        throw Error("Unexpected provider send")
      }
      return fetch(url, init)
    }
    expect(await deliverWelcome(user, env, guardedFetch)).toBe(true)
    expect(
      await deliverInvitation(
        {
          email,
          token: "unused",
          send_id: randomUUID(),
          workspace: "Fixture",
          role: "member",
          expires_at: "2026-09-21",
        },
        env,
        guardedFetch
      )
    ).toBe("suppressed")
    expect(sends).toBe(0)
    expect(
      (
        await admin
          .from("notifications")
          .insert({
            user_id: user.id,
            kind: "message",
            title: "Should be suppressed",
            body: "Fixture",
          })
      ).error
    ).toBeNull()
    expect(
      (await customer.from("notifications").select("id")).data
    ).toHaveLength(1)
    await inApp.click()
    await expect(inApp).toBeChecked()
    expect((await prefs()).data).toEqual({
      email_enabled: false,
      in_app_enabled: true,
    })
    expect(
      (
        await admin
          .from("notifications")
          .insert({
            user_id: user.id,
            kind: "message",
            title: "Enabled fixture",
            body: "Fixture",
          })
      ).error
    ).toBeNull()
    expect(
      (await customer.from("notifications").select("id")).data
    ).toHaveLength(2)
    // Switching workspaces must keep the same account preferences.
    const other = await customer.rpc("create_workspace", {
      workspace_name: "Preference workspace",
      request_id: randomUUID(),
    })
    expect(other.error).toBeNull()
    await page.reload()
    await page
      .getByRole("button", { name: "Switch workspace", exact: true })
      .click()
    await page
      .getByRole("menuitem", { name: "Preference workspace", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find(
            (cookie) => cookie.name === "forma-workspace"
          )?.value
      )
      .toBe(other.data)
    await page.goto("/dashboard/account?tab=notifications")
    await expect(mail).not.toBeChecked()
    await expect(inApp).toBeChecked()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole("button", { name: "Dark mode", exact: true }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: "test-results/notification-preferences-mobile-dark.png",
      fullPage: true,
    })
    // Failure must preserve the last persisted value and allow another try.
    await page.route("**/dashboard/account?tab=notifications", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue()
    )
    await mail.click()
    await expect(
      page.getByRole("alert").filter({ hasText: "couldn't be saved" })
    ).toBeVisible()
    await expect(mail).not.toBeChecked()
    await page.unroute("**/dashboard/account?tab=notifications")
    await mail.click()
    await expect(mail).toBeChecked()
    expect((await prefs()).data).toEqual({
      email_enabled: true,
      in_app_enabled: true,
    })
    expect(errors).toEqual([])
  } finally {
    await customer.auth.signOut()
    if ((await admin.auth.admin.deleteUser(user.id)).error)
      throw Error("Preference fixture cleanup failed")
  }
})
