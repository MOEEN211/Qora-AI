import { test, expect } from "@playwright/test"

test("signed-out auth logos navigate to the public landing page", async ({
  page,
}) => {
  for (const path of ["/login", "/signup"]) {
    await page.goto(path)
    const logo = page
      .locator("header")
      .getByRole("link", { name: "Forma home" })
    await expect(logo).toHaveAttribute("href", "/")
    await logo.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole("link", { name: "Sign in", exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Account menu", exact: true })
    ).toHaveCount(0)
  }
})

test("login and signup expose Google and passwordless email without requiring a password", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  for (const path of ["/login", "/signup"]) {
    await page.goto(path)
    await expect(
      page.getByRole("button", { name: "Continue with Google" })
    ).toBeEnabled()
    await expect(
      page.getByText("Google sign-in is currently unavailable.", { exact: true })
    ).toHaveCount(0)
    // The theme control enables after hydration; wait before client-only clicks.
    await expect(page.getByRole("button", { name: "Light mode", exact: true })).toBeEnabled()
    await page.getByRole("button", { name: "Magic link", exact: true }).click()
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Send magic link", exact: true })
    ).toBeVisible()
    await page
      .getByRole("button", { name: "Send magic link", exact: true })
      .click()
    expect(await page.locator("input:invalid").count()).toBeGreaterThan(0)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: `test-results/auth-${path.slice(1)}-magic-mobile.png`,
      fullPage: true,
    })
    await page.getByRole("button", { name: "Password", exact: true }).click()
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible()
  }
  expect(errors).toEqual([])
})

test("failed Google callback and invalid magic link have safe retry paths", async ({
  page,
}) => {
  await page.goto(
    "http://127.0.0.1:3000/auth/callback?error=access_denied&next=https://attacker.invalid"
  )
  await expect(page).toHaveURL("http://127.0.0.1:3000/login?auth=failed")
  await expect(
    page.getByRole("alert").filter({ hasText: "Google sign-in" })
  ).toBeVisible()
  await page.goto("/auth/confirm?type=email&flow=magic")
  await page.getByRole("button", { name: "Sign in and continue" }).click()
  await expect(
    page.getByRole("alert").filter({ hasText: "This link isn't valid" })
  ).toBeVisible()
  await page.getByRole("link", { name: "Request a new link" }).click()
  await expect(page).toHaveURL(/\/login$/)
})
