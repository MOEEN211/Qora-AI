import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import { createApi } from "../../scripts/kickstart/core.mjs"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
const runFile = promisify(execFile)
test.use({ trace: "off", screenshot: "off", video: "off", actionTimeout: 15000 })
test("admin: ordinary login, six sections, grants, revocation, logout and last-admin protection", async ({ page, browser }) => {
  test.skip(process.env.RUN_HOSTED_ADMIN !== "true", "Explicit hosted admin acceptance opt-in required")
  test.setTimeout(300000)
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co`) throw Error("Explicit hosted target required")
  const api = createApi(env), options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, options)
  const ids: string[] = [], emails: string[] = []
  const password = `Admin-${randomUUID()}!`; const errors: string[] = []
  page.on("pageerror", e => errors.push(e.message))
  const second = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3100" })
  const otherPage = await second.newPage()
  async function login(p: Page, email: string) {
    await p.goto("/admin")
    await p.getByLabel("Email address", { exact: true }).fill(email)
    await p.getByLabel("Password", { exact: true }).fill(password)
    await p.getByRole("button", { name: "Sign in", exact: true }).click()
    await expect(p).not.toHaveURL(/\/login$/)
    if (new URL(p.url()).pathname === "/onboarding") await p.getByRole("button", { name: "Skip for now" }).click()
  }
  try {
    for (let i = 0; i < 2; i++) {
      const email = `operator-e2e-${randomUUID()}@example.invalid`
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Admin Fixture ${i + 1}` } })
      if (created.error || !created.data.user) throw Error("Fixture creation failed")
      ids.push(created.data.user.id); emails.push(email)
    }
    // Exercise the buyer's actual CLI, including its read-only check and retry path.
    await runFile(process.execPath, ["scripts/admin/index.mjs", "grant", "--email", emails[0], "--check"])
    const [pregrant] = await api.query(`select exists(select 1 from private.operator_users where user_id='${ids[0]}') as granted`)
    expect(pregrant.granted).toBe(false)
    await runFile(process.execPath, ["scripts/admin/index.mjs", "grant", "--email", emails[0]])
    const retry = await runFile(process.execPath, ["scripts/admin/index.mjs", "grant", "--email", emails[0]])
    expect(retry.stdout).toContain("already matches")
    await login(otherPage, emails[1]); await otherPage.goto("/admin")
    await expect(otherPage.getByRole("heading", { name: "Admin access required" })).toBeVisible()
    await login(page, emails[0])
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
    await expect(page.getByText("Continue with authenticator", { exact: true })).toHaveCount(0)
    expect((await page.request.get("/api/admin?section=admins")).status()).toBe(200)
    await page.reload(); await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
    await page.screenshot({ path: "test-results/admin-overview.png", fullPage: true })
    for (const [route, title] of [["users", "Users"], ["workspaces", "Workspaces"], ["subscriptions", "Subscriptions"], ["usage", "AI usage"], ["feedback", "Feedback"]]) {
      await page.goto(`/admin/${route}`); await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
      await expect(page.getByText("Admin data is unavailable", { exact: true })).not.toBeVisible()
    }
    await page.goto(`/admin/users/${ids[0]}`); await expect(page.getByRole("heading", { name: "Onboarding answers" })).toBeVisible()
    await page.getByRole("button", { name: "Admin account menu" }).click(); await page.getByRole("menuitem", { name: "Manage admins" }).click()
    await page.getByLabel("New admin email").fill(emails[1]); await page.getByRole("button", { name: "Add admin", exact: true }).click()
    await expect(page.getByRole("status")).toContainText("Admin added")
    await otherPage.reload(); await expect(otherPage.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
    await page.getByRole("listitem").filter({ hasText: emails[1] }).getByRole("button", { name: "Remove", exact: true }).click()
    await page.getByRole("button", { name: "Confirm removal" }).click(); await expect(page.getByRole("status")).toContainText("removed")
    await otherPage.reload(); await expect(otherPage.getByRole("heading", { name: "Admin access required" })).toBeVisible()
    const removeSelf = page.getByRole("listitem").filter({ hasText: emails[0] }).getByRole("button", { name: "Remove", exact: true })
    const [operatorCount] = await api.query("select count(*)::integer as count from private.operator_users")
    if (operatorCount.count === 1) await expect(removeSelf).toBeDisabled()
    await page.keyboard.press("Escape"); await page.goto("/admin")
    await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole("button", { name: "Dark mode", exact: true }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: "test-results/admin-mobile.png", fullPage: true })
    await page.getByRole("button", { name: "Admin account menu" }).click(); await page.getByRole("menuitem", { name: "Sign out", exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await login(page, emails[0])
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible()
    // Concurrent removals serialize with the same database lifecycle lock.
    await api.query(`select private.operator_command('${emails[1]}',true)`, false)
    if (operatorCount.count === 1) {
      const results = await Promise.allSettled(emails.map(email => api.query(`select private.operator_command('${email}',false)`, false)))
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1)
      expect(results.filter(r => r.status === "rejected")).toHaveLength(1)
      const [remaining] = await api.query("select count(*)::integer as count from private.operator_users")
      expect(remaining.count).toBe(1)
    }
    expect(errors).toEqual([])
  } finally {
    await second.close()
    // A fixture may be the sole operator. Database-owner cleanup is tightly bounded:
    // transactional table lock, only these generated fixture UUIDs/emails, trigger restored before commit.
    // No runtime/CLI bypass is added, and no owner's account is modified.
    if (ids.length) {
      const values = ids.map(id => `'${id}'`).join(",")
      await api.query(`begin; lock table private.operator_users in access exclusive mode; alter table private.operator_users disable trigger operator_membership_deletion;
        delete from private.operator_users where user_id in (${values}) and user_id in(select id from auth.users where email like 'operator-e2e-%@example.invalid');
        alter table private.operator_users enable trigger operator_membership_deletion; commit;`, false)
      for (const id of ids) { const result = await admin.auth.admin.deleteUser(id); if (result.error) throw Error("Admin fixture cleanup failed") }
    }
  }
})
