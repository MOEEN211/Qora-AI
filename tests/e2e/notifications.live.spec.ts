import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

test.use({ trace: "off", screenshot: "off", video: "off" })

test("hosted notifications: signup, popover navigation, persistent reads, pagination and responsive inbox", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_HOSTED_NOTIFICATIONS !== "true",
    "Opt in to the dedicated hosted notification test."
  )
  test.setTimeout(180_000)
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (
    !env.SUPABASE_SECRET_KEY ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !env.HOSTED_TEST_PROJECT_REF ||
    env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co` ||
    env.AUTH_EMAIL_VERIFICATION !== "false"
  )
    throw new Error(
      "Explicitly configure the dedicated hosted target with immediate signup before this test."
    )
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
  const email = `notifications-${randomUUID()}@example.invalid`
  const password = `Notifications-${randomUUID()}!`
  const ids: string[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    // Actual public Auth signup invokes the same trigger as the signup form.
    // Auto-confirm is required so this fixture does not send an Auth email.
    const created = await customer.auth.signUp({
      email,
      password,
      options: { data: { full_name: "Notification Tester" } },
    })
    if (created.error || !created.data.user)
      throw new Error("Disposable notification signup failed.")
    ids.push(created.data.user.id)
    expect(created.data.user.email_confirmed_at).toBeTruthy()
    const second = await admin.auth.admin.createUser({
      email: `notifications-${randomUUID()}@example.invalid`,
      password,
      email_confirm: true,
    })
    if (second.error || !second.data.user)
      throw new Error("Second notification fixture failed.")
    ids.push(second.data.user.id)
    const welcome = await customer.from("notifications").select("id,read_at")
    expect(welcome.error).toBeNull()
    expect(welcome.data).toHaveLength(1)
    expect(welcome.data![0].read_at).toBeNull()
    const firstId = welcome.data![0].id
    expect((await request.get("/api/notifications")).status()).toBe(401)
    await page.goto("/login")
    await page.getByLabel("Email address", { exact: true }).fill(email)
    await page.getByLabel("Password", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    const bell = page.getByRole("button", { name: /^Notifications/ })
    await expect(bell).toHaveAccessibleName("Notifications, 1 unread")
    await expect(bell.locator("[data-unread-dot]")).toBeVisible()
    await bell.focus()
    await page.keyboard.press("Enter")
    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover.getByText("Welcome to your workspace")).toBeVisible()
    await expect(popover).toHaveCSS("opacity", "1")
    await page.screenshot({
      path: "test-results/notification-popover.png",
      animations: "disabled",
    })
    await popover
      .getByRole("button", { name: /Welcome to your workspace/ })
      .click()
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/notifications#notification-${firstId}$`)
    )
    await expect(
      page.getByRole("heading", { name: "Notifications", exact: true })
    ).toBeVisible()
    await expect(page.getByRole("article")).toHaveCount(1)
    await expect(page.getByText("Read", { exact: true })).toBeVisible()
    await expect(bell.locator("[data-unread-dot]")).toHaveCount(0)
    await page.reload()
    await expect(bell).toHaveAccessibleName("Notifications")
    expect(
      (
        await customer
          .from("notifications")
          .select("read_at")
          .eq("id", firstId)
          .single()
      ).data?.read_at
    ).toBeTruthy()
    const inserted = await admin.from("notifications").insert(
      Array.from({ length: 25 }, (_, index) => ({
        user_id: ids[0],
        title: `Workspace update ${index + 1}`,
        body: "A sample update to check your notification inbox and read status.",
      }))
    )
    expect(inserted.error).toBeNull()
    await page.reload()
    await expect(bell).toHaveAccessibleName("Notifications, 25 unread")
    await expect(page.getByRole("article")).toHaveCount(20)
    await page.getByRole("link", { name: "Next", exact: true }).click()
    await expect(page.getByRole("article")).toHaveCount(6)
    await page
      .getByRole("button", { name: "Mark as read", exact: true })
      .first()
      .click()
    await expect(bell).toHaveAccessibleName("Notifications, 24 unread")
    await page
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click()
    await expect(bell).toHaveAccessibleName("Notifications")
    await expect(
      page.getByRole("button", { name: "Mark as read", exact: true })
    ).toHaveCount(0)
    expect(
      (
        await customer
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null)
      ).count
    ).toBe(0)
    expect(
      (
        await admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", ids[1])
          .is("read_at", null)
      ).count
    ).toBe(1)
    await page.getByRole("link", { name: "Previous", exact: true }).click()
    await expect(page.getByRole("article")).toHaveCount(20)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: "test-results/notifications-desktop.png" })
    await page.getByRole("button", { name: "Dark mode", exact: true }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.screenshot({ path: "test-results/notifications-dark.png" })
    await page.setViewportSize({ width: 390, height: 844 })
    await bell.click()
    await expect(popover).toBeVisible()
    await expect(popover).toHaveCSS("opacity", "1")
    const bounds = await popover.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    await page.screenshot({
      path: "test-results/notifications-mobile.png",
      animations: "disabled",
    })
    await page.keyboard.press("Escape")
    await expect(popover).not.toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    // Read failures retain existing messages and offer a retry.
    await page.route("**/api/notifications", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"unavailable"}',
      })
    )
    await bell.click()
    await expect(popover.getByRole("alert")).toBeVisible()
    await page.unroute("**/api/notifications")
    await popover.getByRole("button", { name: "Try again" }).click()
    await expect(popover.getByRole("alert")).toHaveCount(0)
    await page.keyboard.press("Escape")
    // Empty inbox is valid, and refresh in another tab is picked up on focus.
    expect(
      (await admin.from("notifications").delete().eq("user_id", ids[0])).error
    ).toBeNull()
    await page.reload()
    await expect(
      page.getByRole("heading", { name: "No notifications yet" })
    ).toBeVisible()
    await bell.click()
    await expect(popover.getByText("No notifications yet")).toBeVisible()
    await page.keyboard.press("Escape")
    expect(
      (
        await admin.from("notifications").insert({
          user_id: ids[0],
          title: "A new update",
          body: "This update arrived while the inbox was open.",
        })
      ).error
    ).toBeNull()
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))
    await expect(bell).toHaveAccessibleName("Notifications, 1 unread")
    expect(errors).toEqual([])
  } finally {
    await customer.auth.signOut({ scope: "local" })
    for (const id of ids.reverse()) {
      if ((await admin.auth.admin.deleteUser(id)).error)
        throw new Error("Disposable notification fixture cleanup failed.")
    }
  }
})
