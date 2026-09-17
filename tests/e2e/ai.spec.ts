import { test, expect } from "@playwright/test"
test("chat layout shows scoped usage and saved messages on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/preview/chat")
  await expect(
    page.getByRole("heading", { name: "AI chat", exact: true })
  ).toBeVisible()
  await expect(page.getByText("98 credits available")).toBeVisible()
  await expect(page.getByText("Shared by Acme")).toBeVisible()
  await expect(page.getByRole("log")).toContainText("Welcome to Acme.")
  await expect(page.getByText("24 in / 49 out tokens")).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Send message" })
  ).toBeDisabled()
  await page.getByRole("button", { name: "Copy response" }).focus()
  await expect(
    page.getByRole("button", { name: "Copy response" })
  ).toBeFocused()
  await page.screenshot({ path: "artifacts/ai/ai-desktop.png", fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await expect(
    page.getByRole("textbox", { name: "Your message" })
  ).toBeDisabled()
  await page.screenshot({ path: "artifacts/ai/ai-mobile.png", fullPage: true })
})

test("new chat uses the viewport and history stays accessible when collapsed", async ({
  page,
}) => {
  await page.goto("/preview/chat?empty=1")
  await expect(
    page.getByRole("heading", { name: "Where should we start?" })
  ).toBeVisible()
  for (const name of [
    "Brainstorm",
    "SaaS ideas",
    "Write something",
    "Make a plan",
  ])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible()
  await expect(
    page.locator("#app-sidebar").getByRole("button", { name: "New chat" })
  ).toHaveCount(0)
  await expect(
    page.locator("main").getByRole("button", { name: "New chat" })
  ).toBeVisible()
  const composer = await page.locator("[data-chat-composer]").boundingBox()
  expect(composer!.y + composer!.height).toBe(1000)
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click()
  await page
    .getByRole("button", { name: "Open chat history", exact: true })
    .click()
  await expect(page.getByRole("dialog")).toContainText("A welcome message")
  expect(
    (await page.getByRole("dialog").getByRole("link").first().boundingBox())!
      .height
  ).toBeLessThanOrEqual(40)
  await expect(
    page.getByRole("textbox", { name: "Search chat history" })
  ).toBeFocused()
  await page
    .getByRole("textbox", { name: "Search chat history" })
    .fill("missing")
  await expect(page.getByText("No conversations found")).toBeVisible()
  await page.getByRole("button", { name: "Clear search" }).click()
  await expect(page.getByRole("dialog")).toContainText("A welcome message")
  await page.screenshot({
    path: "artifacts/ai/history-dialog-desktop.png",
    fullPage: true,
  })
  await page.keyboard.press("Escape")
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole("heading", { name: "Where should we start?" })
  ).toBeVisible()
  const mobile = await page.locator("[data-chat-composer]").boundingBox()
  expect(mobile!.y + mobile!.height).toBe(844)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight
    )
  ).toBe(true)
  await page.screenshot({
    path: "artifacts/ai/ai-empty-mobile.png",
    fullPage: true,
  })
  await page.getByRole("button", { name: "Open chat history" }).click()
  await expect(
    page.getByRole("textbox", { name: "Search chat history" })
  ).toBeFocused()
  await page
    .getByRole("dialog")
    .evaluate((el) =>
      Promise.all(el.getAnimations().map((animation) => animation.finished))
    )
  await page.screenshot({
    path: "artifacts/ai/history-dialog-mobile.png",
    fullPage: true,
  })
})

test("chat loading skeleton keeps standard dashboard padding", async ({
  page,
}) => {
  await page.goto("/preview/chat?loading=1")
  const loading = page.getByRole("status", { name: "Loading workspace" })
  await expect(loading).toHaveCSS("padding-left", "40px")
  await expect(loading).toHaveCSS("padding-top", "48px")
  await page.screenshot({
    path: "artifacts/ai/chat-loading-desktop.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(loading).toHaveCSS("padding-left", "24px")
  await expect(loading).toHaveCSS("padding-top", "40px")
})
