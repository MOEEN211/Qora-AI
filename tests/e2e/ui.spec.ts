import { test, expect } from "@playwright/test"

test("sign-in navigation, password visibility, and theme controls", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/login")
  await expect(
    page.getByRole("heading", { name: "Your workspace awaits." })
  ).toBeVisible()
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-visible-test-password")
  await page.getByRole("button", { name: "Show password" }).click()
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text"
  )
  await page.getByRole("button", { name: "Hide password" }).click()
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "password"
  )
  await page.getByRole("button", { name: "Dark mode", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.getByRole("button", { name: "Light mode", exact: true }).click()
  await page.getByRole("link", { name: "Create an account" }).click()
  await expect(
    page.getByRole("heading", { name: "Make yourself at home." })
  ).toBeVisible()
  await expect(page.getByLabel("Full name")).toBeVisible()
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "minlength",
    "12"
  )
  expect(errors).toEqual([])
})

test("protected routes cannot be entered without a Supabase session", async ({
  page,
}) => {
  for (const route of [
    "/dashboard",
    "/dashboard/account",
    "/dashboard/integrations",
    "/dashboard/workspace",
    "/reset-password",
  ]) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/login$/)
  }
})

test("email recovery and invalid confirmation have usable paths", async ({
  page,
}) => {
  await page.goto("/forgot-password")
  await expect(
    page.getByRole("heading", { name: "Let's get you back in." })
  ).toBeVisible()
  await page.goto("/verify-email")
  await expect(
    page.getByRole("heading", { name: "Check your inbox." })
  ).toBeVisible()
  await page.goto("/auth/confirm?type=email")
  await page.getByRole("button", { name: "Verify email and continue" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "This link isn't valid" })).toBeVisible()
  await page.getByRole("link", { name: "Request a new link" }).click()
  await expect(page).toHaveURL(/\/verify-email$/)
})

test("confirmation forms work without JavaScript and keep tokens out of referrers", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    for (const type of ["email", "recovery"]) {
      await page.goto(`http://127.0.0.1:3000/auth/confirm?type=${type}`)
      const responsePromise = page.waitForResponse(
        (response) => response.request().method() === "POST"
      )
      await page.getByRole("button", {
        name: type === "recovery" ? "Continue to reset password" : "Verify email and continue",
      }).click()
      const response = await responsePromise
      expect(response.status()).toBe(200)
      const headers = await response.request().allHeaders()
      expect(headers.origin).toBe("http://127.0.0.1:3000")
      expect(headers.referer).toBe("http://127.0.0.1:3000/")
      await expect(page.getByRole("alert").filter({ hasText: "This link isn't valid" })).toBeVisible()
    }
  } finally {
    await context.close()
  }
})

test("desktop dashboard preview renders without page errors", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/preview")
  await expect(
    page.getByRole("heading", { name: "Welcome home, Alex." })
  ).toBeVisible()
  await expect(page.getByRole("status")).toContainText("Design preview")
  await expect(
    page.getByRole("navigation", { name: "Main navigation" })
  ).toBeVisible()
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test("mobile auth and dashboard have no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of ["/login", "/signup", "/preview"]) {
    await page.goto(route)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    await expect(page.locator("h1")).toBeVisible()
  }
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  })
})
