import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

test.use({ trace: "off", screenshot: "off", video: "off", actionTimeout: 15000 })

test("hosted onboarding: resume, back/forward, completion, durable skip, failures and stale tabs", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.RUN_HOSTED_ONBOARDING !== "true",
    "Opt in to dedicated hosted onboarding acceptance."
  )
  test.setTimeout(240_000)
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
      "Configure the explicitly authorized hosted test project with immediate signup first."
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
  const ids: string[] = []
  const password = `Onboarding-${randomUUID()}!`
  const email = `onboarding-${randomUUID()}@example.invalid`
  const secondEmail = `onboarding-${randomUUID()}@example.invalid`
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  async function login(target: Page, address: string) {
    await target.goto("/login")
    await target.getByLabel("Email address", { exact: true }).fill(address)
    await target.getByLabel("Password", { exact: true }).fill(password)
    await target.getByRole("button", { name: "Sign in", exact: true }).click()
  }
  async function stored() {
    const result = await customer.from("onboarding").select("*").single()
    expect(result.error).toBeNull()
    return result.data!
  }
  try {
    // Public signup exercises the real Auth insertion transaction without sending mail.
    const created = await customer.auth.signUp({
      email,
      password,
      options: { data: { full_name: "Onboarding Tester" } },
    })
    if (created.error || !created.data.user)
      throw new Error("Disposable onboarding signup failed.")
    ids.push(created.data.user.id)
    expect(created.data.user.email_confirmed_at).toBeTruthy()
    expect((await stored()).status).toBe("in_progress")
    await page.goto("/onboarding")
    await expect(page).toHaveURL(/\/login$/)
    await login(page, email)
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Onboarding Tester"
    )
    await page.screenshot({ path: "test-results/onboarding-name.png" })
    await page.getByLabel("Your name", { exact: true }).fill("")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(page.locator("form").getByRole("alert")).toContainText("Enter the name")
    await page.getByLabel("Your name", { exact: true }).fill("Alex")
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(page.getByText("Step 2 of 3", { exact: true })).toBeVisible()
    expect((await stored()).display_name).toBe("Alex")
    await page.getByText("Work", { exact: true }).click()
    await page.screenshot({ path: "test-results/onboarding-purpose.png" })
    await page.getByRole("button", { name: "Back", exact: true }).click()
    await expect(page.getByLabel("Your name", { exact: true })).toHaveValue(
      "Alex"
    )
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(
      page.getByRole("radio", { name: "Work", exact: true })
    ).toBeChecked()
    await page.reload()
    await expect(
      page.getByRole("radio", { name: "Work", exact: true })
    ).toBeChecked()
    await context.clearCookies()
    await login(page, email)
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByText("Step 2 of 3", { exact: true })).toBeVisible()
    await page.goto("/dashboard/workspace")
    await expect(page).toHaveURL(/\/onboarding$/)
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await page.getByText("Explore the dashboard", { exact: true }).click()
    await page.getByText("Invite teammates", { exact: true }).click()
    await page.getByRole("button", { name: "Back", exact: true }).click()
    await page.getByRole("button", { name: "Continue", exact: true }).click()
    await expect(
      page.getByRole("checkbox", { name: "Invite teammates", exact: true })
    ).toBeChecked()
    await page.screenshot({ path: "test-results/onboarding-interests.png" })
    await page.getByRole("button", { name: "Dark mode", exact: true }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({ path: "test-results/onboarding-mobile-dark.png" })
    const stale = await context.newPage()
    await stale.goto("/onboarding")
    await expect(stale.getByText("Step 3 of 3", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Get started", exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    const completed = await stored()
    expect(completed).toMatchObject({
      status: "completed",
      display_name: "Alex",
      use_case: "work",
      interests: ["dashboard", "team"],
      skipped_at: null,
    })
    expect(completed.completed_at).toBeTruthy()
    await stale
      .getByRole("button", { name: "Skip for now", exact: true })
      .click()
    await expect(stale).toHaveURL(/\/dashboard$/)
    expect((await stored()).completed_at).toBe(completed.completed_at)
    await stale.close()
    await context.clearCookies()
    await login(page, email)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto("/onboarding")
    await expect(page).toHaveURL(/\/dashboard$/)

    // A new account's Skip choice persists even with unanswered questions.
    await context.clearCookies()
    await customer.auth.signOut({ scope: "local" })
    const second = await customer.auth.signUp({
      email: secondEmail,
      password,
      options: { data: { full_name: "Skip Tester" } },
    })
    if (second.error || !second.data.user)
      throw new Error("Second disposable onboarding signup failed.")
    ids.push(second.data.user.id)
    await login(page, secondEmail)
    await expect(page).toHaveURL(/\/onboarding$/)
    await page.getByLabel("Your name", { exact: true }).fill("")
    await page.route("**/onboarding", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue()
    )
    await page
      .getByRole("button", { name: "Skip for now", exact: true })
      .click()
    await expect(page.locator("form").getByRole("alert")).toContainText("weren’t saved")
    expect((await stored()).status).toBe("in_progress")
    await page.unroute("**/onboarding")
    await page
      .getByRole("button", { name: "Skip for now", exact: true })
      .click()
    await expect(page).toHaveURL(/\/dashboard$/)
    const skipped = await stored()
    expect(skipped).toMatchObject({
      status: "skipped",
      display_name: "",
      use_case: null,
      interests: [],
      completed_at: null,
    })
    expect(skipped.skipped_at).toBeTruthy()
    await context.clearCookies()
    await login(page, secondEmail)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goto("/onboarding")
    await expect(page).toHaveURL(/\/dashboard$/)
    expect(errors).toEqual([])
  } finally {
    await customer.auth.signOut({ scope: "local" })
    for (const id of ids.reverse()) {
      if ((await admin.auth.admin.deleteUser(id)).error)
        throw new Error("Disposable onboarding account cleanup failed.")
      expect(
        (await admin.from("onboarding").select("user_id").eq("user_id", id))
          .data
      ).toEqual([])
    }
  }
})

