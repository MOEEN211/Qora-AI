import { test, expect } from "@playwright/test"
test.use({ baseURL: process.env.BLOG_TEST_BASE_URL || "http://localhost:3000" })

test("hosted blog stories, article navigation, legal pages, mobile and dark mode", async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/blog")
  await expect(page.locator(".journal-card")).toHaveCount(3)
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A little perspective."
  )
  await expect(page.locator(".journal-art img").first()).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator(".journal-art img")
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth)
    )
    .toBeGreaterThan(0)
  await page.screenshot({
    path: testInfo.outputPath("blog-desktop.png"),
    fullPage: true,
  })
  await page.locator(".journal-story-link").first().click()
  await expect(page).toHaveURL(/\/blog\/start-small-build-something-real$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Start small. Build something real."
  )
  await page
    .getByRole("navigation", { name: "On this page" })
    .getByRole("link", { name: "Watch someone use it" })
    .click()
  await expect(page).toHaveURL(/#section-4$/)
  await page.reload()
  await expect(page.locator(".journal-prose section")).toHaveCount(4)
  await page.screenshot({
    path: testInfo.outputPath("blog-article.png"),
    fullPage: true,
  })
  const missing = await page.goto("/blog/does-not-exist")
  expect(missing?.status()).toBe(404)
  await expect(
    page.getByRole("heading", { name: "Story not found." })
  ).toBeVisible()
  await page.goto("/blog?page=999")
  await expect(
    page.getByRole("heading", { name: "No stories here yet." })
  ).toBeVisible()
  for (const route of ["/privacy", "/terms"]) {
    await page.goto(route)
    await expect(page.locator(".legal-notice")).toContainText("Sample only")
    await expect(page.locator(".journal-prose")).toContainText(
      "[Legal business name]"
    )
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/
    )
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  for (const route of [
    "/blog",
    "/blog/start-small-build-something-real",
    "/privacy",
    "/terms",
  ]) {
    await page.goto(route)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
  }
  await page.goto("/blog")
  await page.screenshot({
    path: testInfo.outputPath("blog-mobile.png"),
    fullPage: true,
  })
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark")
    location.reload()
  })
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expect(page.locator(".journal-card")).toHaveCount(3)
  await page.screenshot({
    path: testInfo.outputPath("blog-mobile-dark.png"),
    fullPage: true,
  })
  await page.getByRole("button", { name: "Open navigation" }).click()
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Blog", exact: true })
  ).toBeVisible()
  expect(errors).toEqual([])
})
