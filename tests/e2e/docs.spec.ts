import { test, expect } from "@playwright/test"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

test("Nested navigation, field details, language persistence, and copying", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/docs")
  const sidebar = page.locator("#nd-sidebar")
  const workspaces = sidebar.getByRole("button", {
    name: "Workspaces",
    exact: true,
  })
  await expect(workspaces).toHaveAttribute("aria-expanded", "true")
  await workspaces.click()
  await expect(
    sidebar.getByRole("link", { name: "Get workspace", exact: true })
  ).toBeHidden()
  await workspaces.click()
  await sidebar
    .getByRole("link", { name: "Get workspace", exact: true })
    .click()
  await expect(page).toHaveURL(/\/docs\/api\/workspaces\/get$/)
  await expect(
    page.getByRole("heading", { name: "Get workspace", exact: true })
  ).toBeVisible()
  await page.getByRole("tab", { name: "TypeScript", exact: true }).click()
  await page
    .getByRole("tabpanel", { name: "TypeScript", exact: true })
    .getByRole("button", { name: "Copy Text", exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("process.env.WORKSPACE_API_KEY")

  await page.getByRole("button", { name: "Copy Markdown", exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("# Get workspace")
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain("Creation timestamp in ISO format")
  expect(copied).toContain("**TypeScript**")
  expect(copied).not.toContain("<TypeTable")
  const markdownUrl = await page
    .getByRole("link", { name: "View Markdown", exact: true })
    .getAttribute("href")
  const markdown = await request.get(markdownUrl!)
  expect(markdown.headers()["content-type"]).toContain("text/markdown")
  expect(await markdown.text()).toBe(copied.replaceAll("\r\n", "\n"))

  await sidebar
    .getByRole("link", { name: "Rename workspace", exact: true })
    .click()
  await expect(
    page.getByRole("tab", { name: "TypeScript", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  await page.getByRole("tab", { name: "TypeScript", exact: true }).focus()
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("Enter")
  await expect(
    page.getByRole("tab", { name: "curl", exact: true })
  ).toHaveAttribute("aria-selected", "true")
  expect(errors).toEqual([])
})

test("MCP and authoring submenus reveal working guides and accordions", async ({
  page,
}) => {
  await page.goto("/docs")
  const sidebar = page.locator("#nd-sidebar")
  const mcp = sidebar.getByRole("button", { name: "MCP server", exact: true })
  await expect(mcp).toHaveAttribute("aria-expanded", "false")
  await mcp.click()
  await sidebar
    .getByRole("link", { name: "Troubleshooting", exact: true })
    .click()
  const symptom = page.getByRole("button", {
    name: "I need access to another workspace",
    exact: true,
  })
  await symptom.click()
  await expect(
    page.getByText("This is the expected scope.", { exact: false })
  ).toBeVisible()
  await symptom.click()
  await expect(
    page.getByText("This is the expected scope.", { exact: false })
  ).toBeHidden()

  await sidebar
    .getByRole("button", { name: "Build & extend", exact: true })
    .click()
  await sidebar
    .getByRole("link", { name: "Write documentation", exact: true })
    .click()
  await expect(
    page.getByRole("heading", {
      name: "Create menu items with sub-items",
      exact: false,
    })
  ).toBeVisible()
  await page.getByRole("tab", { name: "Subsection", exact: true }).click()
  await expect(
    page.getByRole("tabpanel", { name: "Subsection" })
  ).toContainText('"Workspaces"')
  await sidebar
    .getByRole("link", { name: "Component cookbook", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "Component cookbook", exact: true })
  ).toBeVisible()
})

test("Every public guide renders and its documentation links and anchors resolve", async ({
  page,
}) => {
  test.setTimeout(180000)
  const dir = path.join(process.cwd(), "content/docs")
  const files = (await readdir(dir, { recursive: true })).filter((file) =>
    file.endsWith(".mdx")
  )
  const pages = files.map((file) => {
    const slug = file
      .replaceAll("\\", "/")
      .replace(/\.mdx$/, "")
      .replace(/(^|\/)index$/, "")
    return { file, url: `/docs/${slug}`.replace(/\/$/, "") }
  })
  const destinations = new Map<string, Set<string>>()
  const links: { from: string; url: string }[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  for (const item of pages) {
    const response = await page.goto(item.url)
    expect(response?.status(), item.url).toBe(200)
    const title = (await readFile(path.join(dir, item.file), "utf8")).match(
      /^title: (.+)$/m
    )![1]
    await expect(
      page.getByRole("heading", { name: title, exact: true })
    ).toBeVisible()
    destinations.set(
      item.url,
      new Set(
        await page
          .locator("[id]")
          .evaluateAll((nodes) => nodes.map((node) => node.id))
      )
    )
    const hrefs = await page
      .locator("#nd-page a[href]")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLAnchorElement).getAttribute("href")!)
      )
    for (const href of hrefs)
      if (href.startsWith("/docs") || href.startsWith("#"))
        links.push({ from: item.url, url: href })
  }
  for (const link of links) {
    const url = new URL(link.url, `http://localhost:3000${link.from}`)
    expect(destinations.has(url.pathname), `${link.from} → ${link.url}`).toBe(
      true
    )
    if (url.hash)
      expect(
        destinations
          .get(url.pathname)
          ?.has(decodeURIComponent(url.hash.slice(1))),
        `${link.from} → ${link.url}`
      ).toBe(true)
  }
  expect(errors).toEqual([])
})

test("Legacy URLs and public Markdown exports preserve useful content", async ({
  request,
}) => {
  for (const [oldPath, target] of [
    ["setup", "getting-started/setup"],
    ["authentication", "getting-started/authentication"],
    ["errors", "api/errors"],
    ["extending", "guides/operations"],
    ["documentation", "guides/documentation"],
  ]) {
    const response = await request.get(`/docs/${oldPath}`, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(`/docs/${target}`)
  }
  const index = await request.get("/llms.txt")
  expect(index.status()).toBe(200)
  expect(await index.text()).toContain("/docs/api/workspaces/get")
  const full = await request.get("/llms-full.txt")
  expect(full.status()).toBe(200)
  expect(await full.text()).toContain("# Claude with OAuth")
  expect(await full.text()).toContain("New display name")
  expect((await request.get("/api/docs/markdown/not-a-page")).status()).toBe(
    404
  )
})

test("Docs remain usable on narrow screens and in dark mode", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto("/docs")
  await expect(
    page.getByRole("heading", { name: "Build on your workspace", exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: "tmp/docs-polished-mobile-home.png",
    fullPage: true,
  })
  await page.getByRole("button", { name: "Open Sidebar", exact: true }).click()
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "Get workspace", exact: true })
    .click()
  await expect(page).toHaveURL(/\/docs\/api\/workspaces\/get$/)
  await expect(
    page.getByRole("heading", { name: "Get workspace", exact: true })
  ).toBeVisible()

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    for (const route of [
      "/docs",
      "/docs/api/workspaces/rename",
      "/docs/guides/documentation",
      "/docs/guides/components",
    ]) {
      await page.goto(route)
      await expect
        .poll(
          () =>
            page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth
            ),
          { message: `${width}px ${route}` }
        )
        .toBe(true)
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto("/docs/api/workspaces/get")
  await page.getByRole("button", { name: "Toggle Theme", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === "running").length
      )
    )
    .toBe(0)
  await page.screenshot({
    path: "tmp/docs-polished-dark-endpoint.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: "tmp/docs-polished-dark-mobile.png",
    fullPage: true,
  })
  expect(errors).toEqual([])
})
