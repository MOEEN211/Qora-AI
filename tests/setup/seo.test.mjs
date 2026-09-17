import test from "node:test"
import assert from "node:assert/strict"
import { seoEnvironment, serializeJsonLd } from "../../lib/seo/policy.mjs"

const live = { APP_URL: "https://example.com", NODE_ENV: "production", SEO_INDEXABLE: "true" }

test("SEO indexing needs explicit launch and never enables on development, preview, or localhost", () => {
  assert.equal(seoEnvironment(live).indexable, true)
  assert.equal(seoEnvironment({ ...live, VERCEL_ENV: "production" }).indexable, true)
  for (const override of [
    { SEO_INDEXABLE: undefined }, { SEO_INDEXABLE: "false" },
    { NODE_ENV: "development" }, { VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" },
    { APP_URL: "http://example.com" }, { APP_URL: "https://localhost" },
    { APP_URL: "https://127.0.0.1" }, { APP_URL: "https://[::1]" },
  ]) assert.equal(seoEnvironment({ ...live, ...override }).indexable, false)
})

test("canonical origin ignores saved references and rejects unsafe or ambiguous origins without echoing values", () => {
  assert.equal(seoEnvironment({ ...live, APP_URL_LIVE: "https://other.example" }).origin, "https://example.com")
  for (const APP_URL of ["bad", "https://user:secret@example.com", "https://example.com/path", "https://example.com?secret=value", "https://example.com/#fragment", "javascript:alert(1)"]) {
    assert.throws(() => seoEnvironment({ ...live, APP_URL }), error => error.message.startsWith("SEO: APP_URL") && !error.message.includes("secret"))
  }
})

test("JSON-LD cannot close its script element when public copy contains HTML", () => {
  const value = { title: '</script><script>alert("x")</script>', unicode: "São Paulo" }
  const output = serializeJsonLd(value)
  assert.ok(!output.includes("<"))
  assert.deepEqual(JSON.parse(output), value)
})
