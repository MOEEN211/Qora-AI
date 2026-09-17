import { skipOnboardingIfShown } from "./onboarding-helpers"
import { test, expect, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { parseEnv } from "node:util"
import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import sharp from "sharp"

test.use({
  trace: "off",
  screenshot: "off",
  video: "off",
  baseURL: "http://127.0.0.1:3000",
})
test("workspace logos: square images, permissions, switcher, replacement and deletion", async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.RUN_HOSTED_WORKSPACES !== "true",
    "Use the authorized hosted fixture project."
  )
  test.setTimeout(180000)
  const env = parseEnv(readFileSync(".env", "utf8"))
  if (
    !env.HOSTED_TEST_PROJECT_REF ||
    env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF ||
    env.NEXT_PUBLIC_SUPABASE_URL !==
      `https://${env.HOSTED_TEST_PROJECT_REF}.supabase.co`
  )
    throw Error("Dedicated target required")
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SECRET_KEY!,
    options
  )
  const owner = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL!,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    options
  )
  const ids: string[] = []
  const password = `Logo-${randomUUID()}!`,
    email = `logo-${randomUUID()}@example.invalid`,
    peerEmail = `logo-peer-${randomUUID()}@example.invalid`
  const peerContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3000",
  })
  const peerPage = await peerContext.newPage()
  async function login(p: Page, address: string) {
    await p.goto("/login")
    await p.getByLabel("Email address", { exact: true }).fill(address)
    await p.getByLabel("Password", { exact: true }).fill(password)
    await p.getByRole("button", { name: "Sign in", exact: true }).click()
    await skipOnboardingIfShown(p)
    await expect(p).toHaveURL(/\/dashboard$/)
  }
  try {
    for (const address of [email, peerEmail]) {
      const result = await admin.auth.admin.createUser({
        email: address,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: address === email ? "Logo Owner" : "Logo Peer",
        },
      })
      if (result.error || !result.data.user)
        throw Error("Logo fixture creation failed")
      ids.push(result.data.user.id)
    }
    await owner.auth.signInWithPassword({ email, password })
    const org = (
      await owner
        .from("organization_members")
        .select("org_id")
        .eq("user_id", ids[0])
        .single()
    ).data!.org_id
    await login(page, email)
    await page.goto("/dashboard/workspace")
    await page.getByRole("tab", { name: "Team", exact: true }).click()
    await expect(
      page.getByRole("tab", { name: "Team", exact: true })
    ).toHaveAttribute("aria-selected", "true")
    await page.getByRole("tab", { name: "General", exact: true }).click()
    const image = await sharp({
      create: { width: 320, height: 160, channels: 4, background: "#3366cc" },
    })
      .png()
      .toBuffer()
    const file = page.getByLabel("Workspace logo file")
    await file.setInputFiles({
      name: "bad.png",
      mimeType: "image/png",
      buffer: Buffer.from("not an image"),
    })
    await expect(
      page.getByRole("alert").filter({ hasText: "couldn't process" })
    ).toBeVisible()
    await file.setInputFiles({
      name: "large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(2 * 1024 * 1024 + 1),
    })
    await expect(
      page.getByRole("alert").filter({ hasText: "up to 2 MB" })
    ).toBeVisible()
    await file.setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: image,
    })
    await expect(page.getByRole("status")).toContainText(
      "Workspace logo updated"
    )
    const trigger = page.getByRole("button", {
      name: "Switch workspace",
      exact: true,
    })
    const logo = trigger.getByRole("img")
    await expect(logo).toBeVisible()
    await expect
      .poll(() => logo.evaluate((i) => (i as HTMLImageElement).naturalWidth))
      .toBe(256)
    const src = (await logo.getAttribute("src"))!
    const response = await page.request.get(src)
    expect(response.status()).toBe(200)
    expect(response.headers()["cache-control"]).toContain("no-store")
    const metadata = await sharp(await response.body()).metadata()
    expect(metadata.width).toBe(256)
    expect(metadata.height).toBe(256)
    expect(metadata.format).toBe("webp")
    await page.reload()
    await expect(trigger.getByRole("img")).toBeVisible()
    await trigger.click()
    await expect(
      page
        .getByRole("menuitem")
        .filter({ hasText: "Logo Owner's workspace" })
        .getByRole("img", { name: "Logo Owner's workspace logo", exact: true })
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await page.getByRole("button", { name: "Collapse sidebar" }).click()
    await expect(trigger.getByRole("img")).toBeVisible()
    await page.getByRole("button", { name: "Expand sidebar" }).click()
    await page.screenshot({
      path: "test-results/workspace-logo.png",
      fullPage: true,
      animations: "disabled",
    })
    await login(peerPage, peerEmail)
    expect((await peerPage.request.get(src)).status()).toBe(404)
    expect(
      (
        await admin
          .from("organization_members")
          .insert({ org_id: org, user_id: ids[1], role: "member" })
      ).error
    ).toBeNull()
    await peerPage.reload()
    await peerPage.getByRole("button", { name: "Switch workspace" }).click()
    await peerPage
      .getByRole("menuitem")
      .filter({ hasText: "Logo Owner's workspace" })
      .click()
    await expect
      .poll(
        async () =>
          (await peerContext.cookies()).find(
            (c) => c.name === "forma-workspace"
          )?.value
      )
      .toBe(org)
    await peerPage.goto("/dashboard/workspace")
    await expect(
      peerPage.getByRole("button", { name: "Upload logo", exact: true })
    ).toHaveCount(0)
    await expect(
      peerPage.getByRole("button", { name: "Change logo", exact: true })
    ).toHaveCount(0)
    expect((await peerPage.request.get(src)).status()).toBe(200)
    await owner.rpc("change_workspace_member", {
      target: org,
      person: ids[1],
      new_role: "admin",
    })
    await peerPage.reload()
    await peerPage
      .getByRole("button", { name: "Remove logo", exact: true })
      .click()
    await expect(peerPage.getByRole("status")).toContainText(
      "Workspace logo removed"
    )
    expect((await page.request.get(src)).status()).toBe(404)
    await page.reload()
    await expect(trigger.getByRole("img")).toHaveCount(0)
    // A write from an older browser tab must keep its explicit workspace target.
    const other = (
      await owner.rpc("create_workspace", {
        workspace_name: "Other logo workspace",
        request_id: randomUUID(),
      })
    ).data
    expect(typeof other).toBe("string")
    const second = await page.context().newPage()
    await second.goto("/dashboard/workspace")
    await second.getByRole("button", { name: "Switch workspace" }).click()
    await second
      .getByRole("menuitem", { name: "Other logo workspace", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find(
            (c) => c.name === "forma-workspace"
          )?.value
      )
      .toBe(other)
    await file.setInputFiles({
      name: "replacement.png",
      mimeType: "image/png",
      buffer: image,
    })
    await expect
      .poll(
        async () =>
          (
            await owner
              .from("workspace_logos")
              .select("org_id")
              .eq("org_id", org)
          ).data?.length
      )
      .toBe(1)
    expect(
      (await owner.from("workspace_logos").select("org_id").eq("org_id", other))
        .data
    ).toEqual([])
    await second.close()
    await page.getByRole("button", { name: "Switch workspace" }).click()
    await page
      .getByRole("menuitem")
      .filter({ hasText: "Logo Owner's workspace" })
      .click()
    await expect(trigger.getByRole("img")).toBeVisible()
    await expect(trigger.getByRole("img")).not.toHaveAttribute("src", src)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true)
    await page.getByRole("button", { name: "Dark mode", exact: true }).click()
    await page.screenshot({
      path: "test-results/workspace-logo-mobile-dark.png",
      fullPage: true,
      animations: "disabled",
    })
    await owner.rpc("change_workspace_member", {
      target: org,
      person: ids[1],
      new_role: null,
    })
    expect((await peerPage.request.get(src)).status()).toBe(404)
    const deleted = await admin.rpc("delete_workspace", {
      target: org,
      actor: ids[0],
      confirmation: "Logo Owner's workspace",
    })
    expect(deleted.error).toBeNull()
    expect(
      (await admin.from("workspace_logos").select("org_id").eq("org_id", org))
        .data
    ).toEqual([])
    expect((await page.request.get(src)).status()).toBe(404)
  } finally {
    await peerContext.close()
    await owner.auth.signOut()
    for (const id of ids.reverse()) {
      const result = await admin.auth.admin.deleteUser(id)
      if (result.error) throw Error("Logo fixture cleanup failed")
    }
  }
})
