import { test, expect } from "@playwright/test"

test("Public API and MCP discovery reject anonymous access and untrusted origins", async ({
  request,
}) => {
  for (const path of ["/api/v1/workspace", "/api/mcp"]) {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
    expect(response.headers()["cache-control"]).toBe("no-store")
    expect(response.headers()["www-authenticate"]).toContain("Bearer")
  }
  const badOrigin = await request.post("/api/mcp", {
    headers: { origin: "https://untrusted.example" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  })
  expect(badOrigin.status()).toBe(403)
  expect((await badOrigin.json()).code).toBe("invalid_origin")
  const meta = await request.get(
    "/.well-known/oauth-protected-resource/api/mcp"
  )
  expect(meta.status()).toBe(200)
  expect((await meta.json()).resource).toMatch(/\/api\/mcp$/)
  expect((await meta.json()).authorization_servers).toHaveLength(1)
  expect(
    await (await request.get("/.well-known/oauth-protected-resource")).json()
  ).toEqual(await meta.json())
  const spec = await (await request.get("/api/openapi")).json()
  expect(spec.openapi).toBe("3.1.0")
  expect(spec.paths["/api/v1/workspaces"]).toBeUndefined()
  expect((await request.get("/api/v1/workspaces")).status()).toBe(404)
  expect(spec.paths["/api/v1/workspace"].get.operationId).toBe("get_workspace")
  expect(
    spec.paths["/api/v1/workspace"].patch.requestBody.content[
      "application/json"
    ].schema.additionalProperties
  ).toBe(false)
})

test("Fumadocs navigation, search, mobile layout and theme", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/docs")
  await expect(
    page.getByRole("heading", { name: "Build on your workspace", exact: true })
  ).toBeVisible()
  await page
    .getByRole("link", { name: "REST API reference", exact: true })
    .click()
  await expect(
    page.getByRole("heading", { name: "REST API reference", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Workspace endpoints", exact: false })
  ).toBeVisible()
  await page.getByRole("button", { name: "Search Ctrl K", exact: true }).click()
  const input = page.getByRole("textbox", { name: "Search", exact: true })
  await expect(input).toBeVisible()
  await input.fill("Claude")
  await expect(
    page.getByRole("button", { name: "Connect Claude with OAuth", exact: true })
  ).toBeVisible()
  await page.keyboard.press("Escape")
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true)
  await page.screenshot({
    path: "test-results/docs-mobile.png",
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole("button", { name: "Toggle Theme", exact: true }).click()
  await expect(page.locator("html")).toHaveClass(/dark/)
  await page.screenshot({ path: "test-results/docs-dark.png", fullPage: true })
  expect(errors).toEqual([])
})

test("OAuth login preserves the request and strips identifiers from referrers", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto(
      "http://localhost:3000/oauth/consent?authorization_id=11111111-1111-4111-8111-111111111111"
    )
    await expect(
      page.getByRole("heading", { name: "Sign in to connect" })
    ).toBeVisible()
    const authorizationInputs = page.locator('input[name="authorization_id"]')
    await expect(authorizationInputs).toHaveCount(2)
    for (const input of await authorizationInputs.all()) {
      await expect(input).toHaveValue("11111111-1111-4111-8111-111111111111")
    }
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute(
      "content",
      "strict-origin"
    )
  } finally {
    await context.close()
  }
})
