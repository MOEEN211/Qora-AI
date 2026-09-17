import { test, expect } from "@playwright/test"

test("public pricing matches billing cards and routes to protected billing", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/pricing")
  await expect(page.getByRole("article")).toHaveCount(3)
  await expect(page.getByText("$19", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Yearly", exact: true }).click()
  for (const amount of ["$190", "$490", "$990"])
    await expect(page.getByText(amount, { exact: true })).toBeVisible()
  await expect(
    page.getByText("Save $38 per year", { exact: true })
  ).toBeVisible()
  await page.getByRole("link", { name: "Choose Starter" }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(errors).toEqual([])
})

test("FAQ topics, contact fields, mobile navigation and themes work", async ({
  page,
}) => {
  await page.goto("/faq")
  await page
    .getByRole("navigation", { name: "FAQ topics" })
    .getByRole("link", { name: "Plans & billing" })
    .click()
  await expect(page).toHaveURL(/#plans-and-billing$/)
  await page.locator("#plans-and-billing summary").first().click()
  await expect(
    page.locator("#plans-and-billing details").first()
  ).toHaveAttribute("open", "")
  await page.getByRole("link", { name: "Get in touch" }).click()
  await expect(page).toHaveURL(/\/contact$/)
  await page.getByLabel("Your name", { exact: true }).fill("Example Visitor")
  await page.getByLabel("Email address", { exact: true }).fill("invalid")
  expect(
    await page
      .getByLabel("Email address", { exact: true })
      .evaluate((el: HTMLInputElement) => el.validity.typeMismatch)
  ).toBe(true)
  await page
    .getByLabel("Email address", { exact: true })
    .fill("visitor@example.com")
  await page.getByLabel("What’s it about?").selectOption("Getting started")
  await page
    .getByLabel("Your message", { exact: true })
    .fill("I would like help getting my workspace set up.")
  await expect(page.locator("#message-hint")).toContainText(
    `${(await page.getByLabel("Your message", { exact: true }).inputValue()).length} / 5,000`
  )
  // Do not send real email from a UI check.
  await page.screenshot({
    path: "test-results/contact-desktop-full.png",
    fullPage: true,
  })
  for (const route of ["/contact", "/faq", "/pricing"]) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(route)
    await page.getByRole("button", { name: "Dark mode", exact: true }).click()
    await expect(page.locator("html")).toHaveClass(/dark/)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.screenshot({
      path: `test-results${route}-mobile-dark.png`,
      fullPage: true,
    })
    await page.setViewportSize({ width: 320, height: 740 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.getByRole("button", { name: "Light mode", exact: true }).click()
    await page.getByRole("button", { name: "Open navigation" }).click()
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Contact", exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
  }
})
