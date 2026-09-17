import type { Page } from "@playwright/test"

// Feature tests intentionally skip the introductory survey on disposable accounts.
// The dedicated onboarding spec owns the complete first-run acceptance flow.
export async function skipOnboardingIfShown(page: Page) {
  await page.waitForURL((url) => ["/onboarding", "/dashboard", "/oauth/consent", "/invite"].includes(url.pathname))
  if (new URL(page.url()).pathname !== "/onboarding") return
  await page.getByRole("button", { name: "Skip for now", exact: true }).click()
  await page.waitForURL((url) => url.pathname !== "/onboarding")
}
