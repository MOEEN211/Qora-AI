import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect } from "@playwright/test"
import { aiFixture } from "../helpers/ai-fixture.mjs"
test.use({ trace: "off", screenshot: "off", video: "off" })
test("search finds older saved chats, paginates, and opens a conversation", async ({
  page,
}) => {
  test.skip(
    process.env.RUN_HOSTED_AI !== "true",
    "Requires the authorized hosted AI project."
  )
  const f = await aiFixture()
  try {
    await f.api.query(
      `insert into private.ai_chats(id,org_id,title,created_at) select gen_random_uuid(),'${f.orgId}'::uuid,'Project notes '||n,now()-n*interval '1 day' from generate_series(1,25) n;
    insert into private.ai_chats(id,org_id,title,created_at) values(gen_random_uuid(),'${f.orgId}'::uuid,'An older launch idea',now()-interval '90 days');`,
      false
    )
    await page.goto(`${f.env.APP_URL}/login`)
    await page.getByLabel("Email address", { exact: true }).fill(f.email)
    await page.getByLabel("Password", { exact: true }).fill(f.password)
    await page.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(page)
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.getByRole("link", { name: /^AI chat(bot)?$/ }).click()
    await expect(
      page.locator("#app-sidebar").getByRole("button", { name: "New chat" })
    ).toHaveCount(0)
    await page.getByRole("button", { name: "Open chat history" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByRole("link")).toHaveCount(20)
    await dialog
      .getByRole("button", { name: "Load more conversations" })
      .click()
    await expect(dialog.getByRole("link")).toHaveCount(26)
    await page
      .getByRole("textbox", { name: "Search chat history" })
      .fill("older launch")
    await expect(dialog.getByRole("link")).toHaveCount(1)
    await dialog.getByRole("link", { name: /An older launch idea/ }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page).toHaveURL(/\/dashboard\/chat\/[a-f0-9-]+$/)
    await page.getByRole("button", { name: "Open chat history" }).click()
    await page.keyboard.press("Escape")
    await expect(
      page.getByRole("button", { name: "Open chat history" })
    ).toBeFocused()
    await page.getByRole("button", { name: "New chat", exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\/chat$/)
    await expect(
      page.getByRole("heading", { name: "Where should we start?" })
    ).toBeVisible()
  } finally {
    await f.cleanup()
  }
})
