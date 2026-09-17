import { test, expect } from "@playwright/test"

test("billing plan preview switches intervals, stays keyboard accessible and fits mobile", async ({
  page,
}) => {
  await page.goto("/preview/billing")
  await expect(
    page.getByRole("heading", { name: "Workspace subscription" })
  ).toBeVisible()
  await expect(page.getByText("$19", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Yearly", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Yearly", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByText("$190", { exact: true })).toBeVisible()
  await expect(page.getByText("$490", { exact: true })).toBeVisible()
  await expect(page.getByText("$990", { exact: true })).toBeVisible()
  await expect(
    page.getByText("Save $38 per year", { exact: true })
  ).toBeVisible()
  for (const name of [
    "Update payment method",
    "View invoices",
    "Manage cancellation",
  ]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0)
  }
  await expect(
    page.getByRole("heading", { name: "Billing details" })
  ).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Choose Starter" })
  ).toBeDisabled()
  await page.getByRole("button", { name: "Monthly", exact: true }).focus()
  await page.keyboard.press("Enter")
  await expect(page.getByText("$19", { exact: true })).toBeVisible()
  await page.screenshot({
    path: "test-results/billing-desktop.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true)
  await expect(
    page.getByRole("button", { name: "Choose Growth" })
  ).toBeDisabled()
  await page.evaluate(() => localStorage.setItem("theme", "dark"))
  await page.reload()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({
    path: "test-results/billing-mobile.png",
    fullPage: true,
    animations: "disabled",
  })
})

test("billing shows the current annual plan, scheduled cancellation and member restrictions", async ({
  page,
}) => {
  await page.goto("/preview/billing?state=active")
  await expect(
    page.getByRole("button", { name: "Yearly", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    page
      .getByRole("article", { name: "Pro plan" })
      .getByRole("button", { name: "Current plan" })
  ).toBeDisabled()
  await expect(
    page.getByRole("button", { name: "Manage subscription" })
  ).toBeDisabled()
  await page.goto("/preview/billing?state=canceling")
  await expect(
    page.getByText("Cancellation scheduled", { exact: true })
  ).toBeVisible()
  await expect(
    page.getByText("Access ends Jan 1, 2030", { exact: true })
  ).toBeVisible()
  await page.goto("/preview/billing?state=member")
  await expect(
    page.getByText(
      "Only workspace owners and admins can view and manage billing."
    )
  ).toBeVisible()
  await expect(page.getByRole("article")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "View invoices" })).toHaveCount(
    0
  )
})
