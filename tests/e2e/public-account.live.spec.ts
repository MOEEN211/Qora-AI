import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

// Auth credentials and cookies must not enter browser traces or screenshots.
test.use({ trace: "off", screenshot: "off", video: "off" })

test("signed-in auth redirects and public account menus preserve session boundaries", async ({
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
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
  const context = await browser.newContext()
  context.setDefaultTimeout(15_000)
  const anonymous = await browser.newContext()
  const errors: string[] = []
  let userId: string | undefined
  try {
    const email = `public-header-${randomUUID()}@example.invalid`
    const password = `${randomUUID()}Aa1!`
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Header Test" },
    })
    if (created.error || !created.data.user)
      throw new Error("Could not create disposable header fixture")
    userId = created.data.user.id
    const page = await context.newPage()
    page.on("pageerror", (error) => errors.push(error.message))
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text())
    })
    await page.goto(`${env.APP_URL}/login`)
    await page.getByLabel("Email address", { exact: true }).fill(email)
    await page.getByLabel("Password", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    // An unconsumed invitation must survive a visit to an auth page.
    const invitation = "a".repeat(64)
    await context.addCookies([
      {
        name: "forma-invitation",
        value: invitation,
        url: env.APP_URL,
        httpOnly: true,
        sameSite: "Lax",
      },
    ])
    for (const path of ["/login", "/signup"]) {
      await page.goto(`${env.APP_URL}${path}`)
      await skipOnboardingIfShown(page)
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0)
    }
    expect(
      (await context.cookies()).find((c) => c.name === "forma-invitation")
        ?.value === invitation
    ).toBe(true)
    for (const path of [
      "/",
      "/pricing",
      "/faq",
      "/contact",
      "/blog",
      "/privacy",
      "/terms",
      "/docs",
    ]) {
      const response = await page.goto(`${env.APP_URL}${path}`)
      // Next dev replaces application cache headers with no-cache/must-revalidate.
      expect(response?.headers()["cache-control"]).toMatch(/no-store|no-cache/)
      const menu = page
        .getByRole("button", { name: "Account menu", exact: true })
        .filter({ visible: true })
      await expect(menu).toBeVisible()
      await menu.click()
      await expect(
        page.getByRole("menuitem", { name: "Dashboard", exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole("menuitem", { name: "Settings", exact: true })
      ).toBeVisible()
      await expect(
        page.getByRole("menuitem", { name: "Sign out", exact: true })
      ).toBeVisible()
      // Only this fictional account's public header is captured, never auth forms.
      if (path === "/") {
        await expect(page.getByRole("menu")).toHaveCSS("opacity", "1")
        await page.screenshot({ path: "tmp/public-account-desktop.png" })
      }
      await page.keyboard.press("Escape")
      await expect(menu).toBeFocused()
    }
    const guest = await anonymous.newPage()
    await guest.goto(env.APP_URL)
    await expect(
      guest.getByRole("link", { name: "Sign in", exact: true })
    ).toBeVisible()
    await expect(
      guest.getByRole("button", { name: "Account menu", exact: true })
    ).toHaveCount(0)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      for (const path of ["/", "/docs"]) {
        await page.goto(`${env.APP_URL}${path}`)
        const menu = page
          .getByRole("button", { name: "Account menu", exact: true })
          .filter({ visible: true })
        await expect(menu).toBeVisible()
        await menu.click()
        await expect(
          page.getByRole("menuitem", { name: "Dashboard", exact: true })
        ).toBeVisible()
        await expect(page.getByRole("menu")).toHaveCSS("opacity", "1")
        if (width === 390 && path === "/")
          await page.screenshot({ path: "tmp/public-account-mobile.png" })
        if (width === 320 && path === "/docs")
          await page.screenshot({ path: "tmp/public-account-docs-mobile.png" })
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth
          )
        ).toBe(true)
        await page.keyboard.press("Escape")
      }
    }
    await page.goto(env.APP_URL)
    await page
      .getByRole("button", { name: "Account menu", exact: true })
      .click()
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\/account$/)
    await page.goto(env.APP_URL)
    await page
      .getByRole("button", { name: "Account menu", exact: true })
      .click()
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto(env.APP_URL)
    await expect(
      page.getByRole("button", { name: "Account menu", exact: true })
    ).toHaveCount(0)
    await page.goto(`${env.APP_URL}/dashboard`)
    await expect(page).toHaveURL(/\/login$/)
    expect(errors).toEqual([])
  } finally {
    await Promise.allSettled([context.close(), anonymous.close()])
    if (userId && (await admin.auth.admin.deleteUser(userId)).error)
      throw new Error("Disposable header fixture cleanup failed")
  }
})
