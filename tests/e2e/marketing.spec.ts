import { test, expect } from "@playwright/test"

test("public landing preview, FAQ, and application navigation work", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const writes: string[] = []
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/api\/|supabase/.test(request.url()))
      writes.push(request.url())
  })
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Build your SaaS.Skip the boilerplate."
  )
  await expect(page.locator("main > section")).toHaveCount(6)
  await page.getByRole("tab", { name: "AI chatbot", exact: true }).click()
  await expect(page.getByLabel("Sample conversation")).toContainText(
    "client portal"
  )
  await page.getByRole("tab", { name: "Integrations", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Workspace API keys" })
  ).toBeVisible()
  await page.getByRole("tab", { name: "MCP", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Connect your AI assistant" })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Workspace", exact: true }).click()
  await expect(page.getByRole("tabpanel")).toContainText("alex@example.com")
  await page.getByRole("tab", { name: "Settings", exact: true }).click()
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Preview Studio")
  await page.getByRole("button", { name: "Save preview" }).click()
  await expect(page.getByRole("status")).toContainText("Updated")
  await page.getByRole("tab", { name: "Overview", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Preview Studio", exact: true })
  ).toBeVisible()
  expect(writes).toEqual([])
  await page.reload()
  await expect(
    page.getByRole("heading", { name: "Acme Studio", exact: true })
  ).toBeVisible()
  await page.locator("#faq summary").first().click()
  await expect(page.locator("#faq details").first()).toHaveAttribute("open", "")
  await expect(page.locator("#pricing").getByRole("article")).toHaveCount(3)
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Docs", exact: true })
    .click()
  await expect(page).toHaveURL(/\/docs$/)
  await expect(page.locator("h1").first()).toBeVisible()
  await page.goto("/")
  await page
    .getByRole("link", { name: "Try the application", exact: true })
    .click()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(page.getByLabel("Full name")).toBeVisible()
  await page.goto("/dashboard")
  await expect(page).toHaveURL(/\/login$/)
  expect(errors).toEqual([])
})

test("mobile navigation, keyboard preview, and dark mode remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  await page.getByRole("button", { name: "Decline", exact: true }).click()
  const overflow = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    )
  expect(await overflow()).toBe(false)
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Pricing", exact: true })
    .click()
  await expect(page).toHaveURL(/\/pricing$/)
  await expect(
    page.getByRole("button", { name: "Open navigation" })
  ).toHaveAttribute("aria-expanded", "false")
  await page.getByRole("button", { name: "Open navigation" }).click()
  await page.keyboard.press("Escape")
  await expect(
    page.getByRole("button", { name: "Open navigation" })
  ).toBeFocused()
  await page.goto("/")
  const overview = page.getByRole("tab", { name: "Overview", exact: true })
  await overview.focus()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("Enter")
  await expect(
    page.getByRole("tab", { name: "AI chatbot", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await page.getByRole("tab", { name: "Settings", exact: true }).click()
  await page.getByLabel("Workspace name").fill("A".repeat(40))
  await page.getByRole("button", { name: "Save preview" }).click()
  await page.getByRole("tab", { name: "Overview", exact: true }).click()
  expect(await overflow()).toBe(false)
  await page.getByRole("button", { name: "Dark mode", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  expect(await overflow()).toBe(false)
  await page.getByRole("button", { name: "Light mode", exact: true }).click()
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await overflow()).toBe(false)
  for (const name of ["AI chatbot", "Workspace", "Integrations", "Settings"]) {
    await page.getByRole("tab", { name, exact: true }).click()
    expect(await overflow()).toBe(false)
  }
  await page.getByRole("tab", { name: "Integrations", exact: true }).click()
  await page.getByRole("tab", { name: "MCP", exact: true }).click()
  expect(await overflow()).toBe(false)
})

test("landing copy and FAQ remain available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto("http://localhost:3000/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await page.locator("#faq summary").last().click()
    await expect(page.locator("#faq details").last()).toHaveAttribute(
      "open",
      ""
    )
    await expect(page.locator("#faq details").last()).toContainText(
      "billed by your providers"
    )
  } finally {
    await context.close()
  }
})
