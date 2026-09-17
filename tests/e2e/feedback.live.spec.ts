import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"

test.use({ trace: "off", screenshot: "off", video: "off" })

test("hosted feedback: private report, shared search, votes, mobile menu, and sign out", async ({
  page,
  browser,
  request,
}) => {
  test.skip(
    process.env.RUN_HOSTED_FEEDBACK !== "true",
    "Opt in to the dedicated hosted feedback test."
  )
  test.setTimeout(240_000)
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (
    !env.SUPABASE_SECRET_KEY ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !env.HOSTED_TEST_PROJECT_REF ||
    env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co`
  )
    throw new Error(
      "Dedicated hosted test target must be explicitly configured."
    )
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const projectUrl = env.NEXT_PUBLIC_SUPABASE_URL
  const ids: string[] = []
  const customers = []
  const contexts = []
  const title = `Export dashboard ${randomUUID()}`
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    for (let i = 0; i < 2; i++) {
      const email = `feedback-${randomUUID()}@example.invalid`
      const password = `Feedback-${randomUUID()}!`
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: `Feedback Tester ${i + 1}` },
      })
      if (created.error || !created.data.user)
        throw new Error("Could not create disposable feedback fixture.")
      ids.push(created.data.user.id)
      customers.push({ email, password })
    }
    expect((await request.get("/api/feedback/features")).status()).toBe(401)
    await page.goto("/login")
    await page
      .getByLabel("Email address", { exact: true })
      .fill(customers[0].email)
    await page
      .getByLabel("Password", { exact: true })
      .fill(customers[0].password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(
      page.locator("header").getByText("Sign out", { exact: true })
    ).toHaveCount(0)
    await page.getByRole("button", { name: "Account menu" }).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem")).toHaveText([
      "Settings",
      "Feature request",
      "Bug report",
      "Sign out",
    ])
    await page.screenshot({ path: "test-results/account-menu.png" })
    await page.getByRole("menuitem", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\/account$/)
    await page.getByRole("button", { name: "Account menu" }).click()
    await page.getByRole("menuitem", { name: "Bug report" }).click()
    let dialog = page.getByRole("dialog")
    await dialog
      .getByLabel("Title", { exact: true })
      .fill("Private feedback fixture")
    await dialog
      .getByLabel("What happened?", { exact: true })
      .fill("A private report with reproduction steps and expected behavior.")
    await dialog.getByRole("button", { name: "Submit bug report" }).click()
    await expect(dialog.getByRole("status")).toContainText(
      "Bug report submitted"
    )
    await dialog.getByRole("button", { name: "Done", exact: true }).click()
    await expect(
      page.getByRole("button", { name: "Account menu" })
    ).toBeFocused()
    await page.getByRole("button", { name: "Account menu" }).click()
    await page
      .getByRole("menuitem", { name: "Feature request", exact: true })
      .click()
    dialog = page.getByRole("dialog")
    await expect(dialog.getByLabel("Title", { exact: true })).toBeVisible()
    const boardBounds = await dialog
      .getByRole("region", { name: "Requested features" })
      .boundingBox()
    const formBounds = await dialog
      .getByRole("region", { name: "Suggest a feature" })
      .boundingBox()
    expect(boardBounds!.x + boardBounds!.width).toBeLessThan(formBounds!.x)
    await dialog.getByLabel("Title", { exact: true }).fill(title)
    await dialog
      .getByLabel("Details", { exact: true })
      .fill("Let customers export dashboard data as a CSV file.")
    await dialog
      .getByRole("button", { name: "Submit feature request", exact: true })
      .click()
    await expect(
      dialog
        .getByRole("status")
        .filter({ hasText: "Feature request submitted" })
    ).toBeVisible()
    await expect(dialog.getByLabel("Title", { exact: true })).toHaveValue("")
    await expect(dialog.getByLabel("Details", { exact: true })).toHaveValue("")
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible()
    await dialog
      .getByRole("textbox", { name: "Search feature requests" })
      .fill(title)
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible()
    await dialog
      .getByRole("button", { name: `Upvote ${title}`, exact: true })
      .click()
    await expect(
      dialog.getByRole("button", {
        name: `Remove vote for ${title}`,
        exact: true,
      })
    ).toHaveText("1")
    await page.screenshot({ path: "test-results/feature-requests.png" })
    // Exercise retries concurrently through ordinary customer clients, bypassing
    // the browser's disabled button and Next's sequential action dispatch.
    const clients = customers.map(() =>
      createClient(projectUrl, publicKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    )
    try {
      for (let index = 0; index < clients.length; index++) {
        const signedIn = await clients[index].auth.signInWithPassword(
          customers[index]
        )
        if (signedIn.error)
          throw new Error("Could not authenticate disposable vote fixture.")
      }
      const board = await clients[0].rpc("search_feature_requests", {
        search_term: title,
        page_number: 0,
      })
      expect(board.error).toBeNull()
      const featureId = board.data.items[0].id
      const attempts = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          clients[index % 2].rpc("set_feature_vote", {
            feature_id: featureId,
            upvoted: true,
          })
        )
      )
      expect(attempts.every((attempt) => !attempt.error)).toBe(true)
      const final = await clients[0].rpc("search_feature_requests", {
        search_term: title,
        page_number: 0,
      })
      expect(final.data.items[0].votes).toBe(2)
      const removed = await clients[1].rpc("set_feature_vote", {
        feature_id: featureId,
        upvoted: false,
      })
      expect(removed.data.votes).toBe(1)
    } finally {
      await Promise.all(
        clients.map((client) => client.auth.signOut({ scope: "local" }))
      )
    }
    await page.reload()
    await page.getByRole("button", { name: "Account menu" }).click()
    await page
      .getByRole("menuitem", { name: "Feature request", exact: true })
      .click()
    dialog = page.getByRole("dialog")
    await dialog
      .getByRole("textbox", { name: "Search feature requests" })
      .fill(title)
    await expect(
      dialog.getByRole("button", {
        name: `Remove vote for ${title}`,
        exact: true,
      })
    ).toHaveText("1")
    await dialog
      .getByRole("textbox", { name: "Search feature requests" })
      .fill("Private feedback fixture")
    await expect(dialog.getByText("No matching requests")).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).not.toBeVisible()
    const context = await browser.newContext({
      baseURL: "http://localhost:3000",
      viewport: { width: 390, height: 844 },
    })
    contexts.push(context)
    const second = await context.newPage()
    await second.goto("/login")
    await second
      .getByLabel("Email address", { exact: true })
      .fill(customers[1].email)
    await second
      .getByLabel("Password", { exact: true })
      .fill(customers[1].password)
    await second.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(second)
    await expect(second).toHaveURL(/\/dashboard$/)
    await second.getByRole("button", { name: "Account menu" }).click()
    await second
      .getByRole("menuitem", { name: "Feature request", exact: true })
      .click()
    const mobileDialog = second.getByRole("dialog")
    await expect(
      mobileDialog.getByLabel("Title", { exact: true })
    ).toBeAttached()
    await mobileDialog
      .getByRole("textbox", { name: "Search feature requests" })
      .fill(title)
    await expect(
      mobileDialog.getByRole("button", { name: `Upvote ${title}`, exact: true })
    ).toHaveText("1")
    await mobileDialog
      .getByRole("button", { name: `Upvote ${title}`, exact: true })
      .click()
    await expect(
      mobileDialog.getByRole("button", {
        name: `Remove vote for ${title}`,
        exact: true,
      })
    ).toHaveText("2")
    await second.screenshot({
      path: "test-results/feature-requests-mobile.png",
    })
    expect(
      await second.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await mobileDialog
      .getByRole("button", { name: `Remove vote for ${title}`, exact: true })
      .click()
    await expect(
      mobileDialog.getByRole("button", { name: `Upvote ${title}`, exact: true })
    ).toHaveText("1")
    await second.keyboard.press("Escape")
    await second.getByRole("button", { name: "Account menu" }).click()
    await second
      .getByRole("menuitem", { name: "Bug report", exact: true })
      .click()
    await expect(
      second.getByRole("heading", { name: "Report a bug" })
    ).toBeVisible()
    await second.screenshot({ path: "test-results/bug-report-mobile.png" })
    await second.keyboard.press("Escape")
    await expect(second.getByRole("dialog")).toHaveCount(0)
    await second.getByRole("button", { name: "Account menu" }).click()
    await second
      .getByRole("menuitem", { name: "Sign out", exact: true })
      .press("Enter")
    await expect(second).toHaveURL(/\/login$/)
    expect(errors).toEqual([])
  } finally {
    for (const context of contexts) await context.close()
    for (const id of ids.reverse()) {
      const deleted = await admin.auth.admin.deleteUser(id)
      if (deleted.error)
        throw new Error("Disposable feedback fixture cleanup failed.")
    }
  }
})
