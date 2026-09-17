import { test, expect } from "@playwright/test"
import sharp from "sharp"

test.use({ baseURL: process.env.SEO_TEST_BASE_URL || "http://localhost:3000" })
const launched = process.env.SEO_EXPECT_INDEXABLE === "true"

test("public pages have unique canonical metadata and complete social cards", async ({
  page,
}) => {
  const titles = new Set<string>()
  for (const path of [
    "/",
    "/pricing",
    "/faq",
    "/contact",
    "/blog",
    "/blog?page=2",
    "/docs",
    "/docs/guides/seo",
  ]) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    const canonical = page.locator('link[rel="canonical"]')
    await expect(canonical).toHaveCount(1)
    const url = new URL((await canonical.getAttribute("href"))!)
    expect(url.pathname + url.search).toBe(path)
    if (process.env.SEO_EXPECT_ORIGIN)
      expect(url.origin).toBe(process.env.SEO_EXPECT_ORIGIN)
    const title = await page.title()
    expect(titles.has(title)).toBe(false)
    titles.add(title)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /\S.{20}/
    )
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(1)
    expect(
      new URL(
        (await page.locator('meta[property="og:url"]').getAttribute("content"))!
      ).toString()
    ).toBe(url.toString())
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /^https?:\/\//
    )
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image"
    )
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      launched ? /^index, follow$/ : /^noindex, follow$/
    )
    await expect(page.locator('link[rel="describedby"]')).toHaveAttribute(
      "href",
      "/llms.txt"
    )
    if (launched) expect(response?.headers()["x-robots-tag"]).toBeUndefined()
    else expect(response?.headers()["x-robots-tag"]).toContain("noindex")
    await expect(page.locator("h1")).toHaveCount(1)
  }
})

test("robots and sitemap agree with launch state and exclude private and placeholder routes", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt")
  expect(robots.status()).toBe(200)
  const text = await robots.text()
  expect(text).toContain(launched ? "Allow: /" : "Disallow: /")
  const sitemap = await request.get("/sitemap.xml")
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()["content-type"]).toContain("xml")
  const xml = await sitemap.text()
  if (launched) {
    expect(text).toContain("Sitemap: ")
    expect(xml).toContain("/docs/guides/seo</loc>")
    expect(xml).toContain("/blog</loc>")
  } else expect(xml).not.toContain("<loc>")
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]).pathname
  )
  for (const path of paths)
    expect(path).not.toMatch(
      /^\/(dashboard|login|signup|preview|setup|api|terms|privacy)(\/|$)/
    )
  expect(xml).not.toContain("?page=")
  expect(xml).not.toContain("<lastmod>")
  for (const path of [
    "/login",
    "/dashboard",
    "/api/openapi",
    "/oauth/consent",
    "/preview",
    "/setup",
  ]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.headers()["x-robots-tag"], path).toContain("noindex")
  }
})

test("agent index links resolve to public content and advertise HTML counterparts", async ({
  request,
  page,
}) => {
  const index = await request.get("/llms.txt")
  expect(index.status()).toBe(200)
  expect(index.headers()["content-type"]).toContain("text/plain")
  const body = await index.text()
  expect(body).toMatch(/^# .+\n\n> /)
  expect(body).toContain("/api/openapi")
  const urls = [...body.matchAll(/\]\((https?:\/\/[^)]+)\)/g)].map(
    (match) => new URL(match[1])
  )
  expect(urls.length).toBeGreaterThan(15)
  for (const url of urls) {
    const response = await request.get(url.pathname)
    expect(response.status(), url.pathname).toBe(200)
    if (url.pathname.includes("/markdown/") || url.pathname.endsWith(".md")) {
      expect(response.headers()["content-type"]).toContain("text/markdown")
      expect(response.headers().link).toContain('rel="canonical"')
      expect(response.headers().link).toContain('rel="describedby"')
    }
  }
  await page.goto("/docs/guides/seo")
  await expect(
    page.locator('link[rel="alternate"][type="text/markdown"]')
  ).toHaveAttribute("href", /\/api\/docs\/markdown\/guides\/seo$/)
  const full = await (await request.get("/llms-full.txt")).text()
  expect(full).toContain("# Claude with OAuth")
  expect(full).toContain("# SEO and AI discovery")
  expect(full).not.toContain("# Build plan")
  expect(full).not.toContain("# Architecture")
  expect((await request.get("/api/docs/markdown/no-such-page")).status()).toBe(
    404
  )
  expect(
    (await request.get("/blog/no-such-seo-test-story/markdown")).status()
  ).toBe(404)
})

test("JSON-LD is readable without JavaScript and the default social image is a real PNG", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: process.env.SEO_TEST_BASE_URL || "http://localhost:3000",
  })
  const page = await context.newPage()
  await page.goto("/")
  await expect(page.locator("h1")).toBeVisible()
  const schema = JSON.parse(
    (await page
      .locator('script[type="application/ld+json"]')
      .first()
      .textContent())!
  )
  expect(schema["@type"]).toBe("WebSite")
  expect(schema.url).toMatch(/^https?:\/\//)
  const image = await request.get("/social-image")
  expect(image.status()).toBe(200)
  expect(image.headers()["content-type"]).toContain("image/png")
  const dimensions = await sharp(await image.body()).metadata()
  expect(dimensions.width).toBe(1200)
  expect(dimensions.height).toBe(630)
  await page.screenshot({ path: "tmp/seo-home.png", fullPage: false })
  await context.close()
})

test("published blog stories expose matching article metadata and Markdown", async ({
  request,
  page,
}) => {
  const response = await request.get("/blog/index.md")
  expect(response.status()).toBe(200)
  const body = await response.text()
  const links = [...body.matchAll(/\]\((https?:\/\/[^)]+\/markdown)\)/g)].map(
    (match) => new URL(match[1])
  )
  test.skip(
    links.length === 0,
    "No published blog stories are available in this installation."
  )
  const path = links[0].pathname.replace(/\/markdown$/, "")
  await page.goto(path)
  const title = (await page.locator("h1").textContent())!
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "article"
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    new RegExp(`${path}$`)
  )
  const article = (
    await page.locator('script[type="application/ld+json"]').allTextContents()
  )
    .map((text) => JSON.parse(text))
    .find((value) => value["@type"] === "BlogPosting")
  expect(article.headline).toBe(title)
  const markdown = await request.get(links[0].pathname)
  expect(await markdown.text()).toContain(`# ${title}`)
  if (launched) {
    const xml = await (await request.get("/sitemap.xml")).text()
    for (const link of links)
      expect(xml).toContain(link.pathname.replace(/\/markdown$/, "") + "</loc>")
  }
})
