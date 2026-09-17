import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect } from "@playwright/test"
import { aiFixture } from "../helpers/ai-fixture.mjs"
test.use({ trace: "off", screenshot: "off", video: "off" })
test("authenticated hosted chat streams, persists, accounts for usage, and isolates workspaces", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_HOSTED_AI !== "true",
    "Opt in after AI is installed."
  )
  test.setTimeout(180000)
  const f = await aiFixture()
  try {
    await page.goto(`${f.env.APP_URL}/login`)
    await page.getByLabel("Email address", { exact: true }).fill(f.email)
    await page.getByLabel("Password", { exact: true }).fill(f.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByRole("link", { name: "AI chatbot", exact: true }).click()
    await page.getByRole("button", { name: "New chat", exact: true }).click()
    await page
      .getByRole("textbox", { name: "Your message" })
      .fill("Reply with exactly: Saved chat works.")
    const streaming = page.waitForResponse(
      (r) => r.url().endsWith("/api/ai/chat") && r.request().method() === "POST"
    )
    await page.evaluate(() => {
      const observations = { assistantFrames: 0, missingUserFrames: 0 }
      const observer = new MutationObserver(() => {
        const inProgress = Array.from(
          document.querySelectorAll('[role="status"]')
        ).some((el) => el.textContent?.includes("Response in progress"))
        const assistant = document.querySelector(
          '[data-message-role="assistant"]'
        )
        if (
          inProgress &&
          assistant?.textContent?.includes("Saved chat works.")
        ) {
          observations.assistantFrames++
          if (
            !document
              .querySelector('[data-message-role="user"]')
              ?.textContent?.includes("Reply with exactly: Saved chat works.")
          )
            observations.missingUserFrames++
        }
      })
      observer.observe(document.querySelector("main")!, {
        childList: true,
        subtree: true,
        characterData: true,
      })
      ;(
        window as unknown as {
          streamObservation: {
            observations: typeof observations
            observer: MutationObserver
          }
        }
      ).streamObservation = { observations, observer }
    })
    await page.getByRole("button", { name: "Send message" }).click()
    await expect(page).toHaveURL(/\/dashboard\/chat\/[a-f0-9-]+$/)
    expect((await streaming).headers()["content-type"]).toContain(
      "text/event-stream"
    )
    await expect(page.getByRole("log")).toContainText("Saved chat works.", {
      timeout: 90000,
    })
    await expect(page.getByText(/in \/ \d+ out tokens/)).toBeVisible()
    await expect(page.getByText(/provider cost/)).toBeVisible()
    await expect(page.getByText("99 credits available")).toBeVisible()
    const frames = await page.evaluate(() => {
      const state = (
        window as unknown as {
          streamObservation: {
            observations: { assistantFrames: number; missingUserFrames: number }
            observer: MutationObserver
          }
        }
      ).streamObservation
      state.observer.disconnect()
      return state.observations
    })
    expect(frames.assistantFrames).toBeGreaterThan(0)
    expect(frames.missingUserFrames).toBe(0)
    const url = page.url()
    await page.reload()
    await expect(page.getByRole("log")).toContainText("Saved chat works.")
    await page.screenshot({
      path: "artifacts/ai/ai-live-desktop.png",
      fullPage: true,
    })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    const composer = await page.locator("[data-chat-composer]").boundingBox()
    expect(composer!.y + composer!.height).toBeLessThanOrEqual(845)
    expect(composer!.y + composer!.height).toBeGreaterThan(810)
    await page.getByRole("button", { name: "Open chat history" }).click()
    await expect(page.getByRole("dialog")).toContainText("Reply with exactly")
    await page.keyboard.press("Escape")
    await page.screenshot({
      path: "artifacts/ai/ai-live-mobile.png",
      fullPage: true,
    })
    const [usage] = await f.api.query(
      `select status,credits_charged,input_tokens,output_tokens,cost_usd from private.ai_generations where org_id='${f.orgId}'::uuid`
    )
    expect(usage.status).toBe("completed")
    expect(usage.credits_charged).toBe(1)
    expect(usage.input_tokens).toBeGreaterThan(0)
    expect(Number(usage.cost_usd)).toBeGreaterThanOrEqual(0)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole("button", { name: "New chat", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: "Where should we start?" })
    ).toBeVisible()
    await page.screenshot({
      path: "artifacts/ai/ai-empty-desktop.png",
      fullPage: true,
    })
    await page.getByRole("button", { name: "SaaS ideas", exact: true }).click()
    await expect(page.getByRole("log")).toContainText(
      "Suggest five focused SaaS ideas"
    )
    await expect(page.getByText("98 credits available")).toBeVisible({
      timeout: 90000,
    })
    await expect(page.locator('[role="log"] article')).toHaveCount(2)
    await expect(
      page.locator('[data-message-role="assistant"]')
    ).not.toContainText("*")
    await page.reload()
    await expect(page.getByRole("log")).toContainText(
      "Suggest five focused SaaS ideas"
    )
    const [totals] = await f.api.query(
      `select count(*)::int as requests from private.ai_generations where org_id='${f.orgId}'::uuid`
    )
    expect(totals.requests).toBe(2)
    await page.getByRole("button", { name: "Open chat history" }).click()
    await page
      .getByRole("navigation", { name: "Conversations" })
      .locator(`a[href="${new URL(url).pathname}"]`)
      .click()
    await expect(page.getByRole("log")).toContainText("Saved chat works.")
    await page.goBack()
    await expect(page.getByRole("log")).toContainText(
      "Suggest five focused SaaS ideas"
    )
    const other = await f.user.rpc("create_workspace", {
      workspace_name: "Other AI fixture",
      request_id: crypto.randomUUID(),
    })
    expect(other.error).toBeNull()
    const cross = await f.user.rpc("ai_history", {
      target: other.data,
      operation: "messages",
      payload: { chat_id: url.split("/").at(-1) },
    })
    expect(cross.error).not.toBeNull()
    const balance = await f.user.rpc("ai_history", {
      target: other.data,
      operation: "credits",
      payload: { mode: "test" },
    })
    expect(balance.data.available).toBe(100)
  } finally {
    await f.cleanup()
  }
})
