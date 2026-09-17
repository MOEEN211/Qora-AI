# SEO and AI discovery

This is reusable infrastructure for the buyer's product. Customize the copy and publish only real capabilities. The starter is noindex by default; enabling metadata does not imply a release or search-engine inclusion.

## Configure and launch

1. Edit `config/site.ts` (brand and general description), `config/marketing.ts` (public copy), and `config/seo.ts` (language, social image, public page allowlist). Replace `app/favicon.ico` and review the generated 1200 × 630 PNG at `/social-image`.
2. Set the active `APP_URL` to your final HTTPS origin with no path, credentials, query, or fragment. Saved `APP_URL_DEV` / `APP_URL_LIVE` values are references only. Canonical URLs never use request headers.
3. Keep `SEO_INDEXABLE=false` while customizing. After reviewing the live site, set `SEO_INDEXABLE=true` in the production build environment and rebuild/redeploy. Deployment kickstart includes this non-secret setting in its explicit production runtime allowlist; see DEPLOYMENT.md. Development, localhost, and Vercel preview builds remain noindex even when true. For other staging hosts leave it false.
4. Verify the deployed HTML, `/robots.txt`, `/sitemap.xml`, and social image. Submit the sitemap in your search engine's webmaster tools if desired. Changes to configuration or MDX require a rebuild; blog exports read the published content on request.

## Add a public page

Use the shared helper in a server page:

```tsx
import { publicMetadata } from "@/lib/seo/metadata"

export const metadata = publicMetadata({
  title: "Your feature",
  description: "Explain what the feature does for the reader.",
  path: "/your-feature",
})
```

Add the real route to `seo.pages` in `config/seo.ts`. Do not register redirects, query/filter variants, account routes, or unfinished pages. Each helper call supplies a complete Open Graph and Twitter object so Next.js's shallow metadata inheritance does not lose shared images. The root intentionally has no canonical: private and unknown routes must not inherit a home-page canonical.

Docs titles and descriptions come from `content/docs` frontmatter. All pages in that public collection are published into discovery files, including pages omitted from navigation; keep drafts outside it. Published blog posts come from the existing anonymous reader with publication RLS. New posts are included beyond the first pagination page. Split the single sitemap before 45,000 blog posts. Real provider read failures fail the sitemap instead of silently publishing an incomplete success. No fabricated modification timestamps, priorities, or update frequencies are emitted. Blog pagination has a distinct canonical per page.

Sample terms/privacy pages keep their explicit noindex and stay outside the sitemap until customized. Authentication, dashboard, OAuth, setup, previews and API responses receive noindex HTTP headers. Public HTML is crawlable after launch so engines can read exclusion directives; robots.txt and noindex are discovery preferences, never access control. Existing server authentication and RLS remain authoritative.

## Structured data

`components/seo/json-ld.tsx` escapes `<` before embedding JSON. The home page describes the real website. Blog articles publish `BlogPosting` from their visible title, excerpt, author, image and publication date. Docs and stories include breadcrumbs. Add relevant schemas only when they match visible, verified content. Do not invent reviews, ratings, business addresses, software prices, or rich-result eligibility.

## Agent entry points

- `/llms.txt`: concise site identity and absolute links to the public product summary, documentation Markdown, blog index, and existing OpenAPI schema.
- `/llms-full.txt`: product summary and all public documentation, generated with the existing MDX component renderers. Blog content is linked separately to keep this response bounded.
- `/index.md`: home-page summary and FAQs from the same marketing configuration.
- `/api/docs/markdown/<slug>`: existing Markdown endpoint, with a canonical HTML link and discovery header.
- `/blog/index.md` and `/blog/<slug>/markdown`: published blog links and full article text from the same public data as HTML.
- HTML has a `describedby` link to `/llms.txt`; home, docs, and blog metadata advertise `text/markdown` alternatives. Markdown responses carry canonical/discovery `Link` headers and noindex to prefer HTML search results.

The conventional filename is **llms.txt**. It is a proposal, not a requirement for AI search or a ranking guarantee. No invented `ai.txt`, public `AGENTS.md`, or unauthenticated agent action endpoint is necessary. The existing REST OpenAPI, MCP and OAuth discovery contracts remain unchanged. Coding assistants customizing the repository should follow `AGENTS.md` and this guide. Public exports never enumerate the filesystem, internal `docs/`, setup receipts, secrets, or workspace records.

References checked for implementation: [Next.js metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), [Next.js JSON-LD](https://nextjs.org/docs/app/guides/json-ld), [llms.txt proposal](https://llmstxt.org/), and [Google's AI search guidance](https://developers.google.com/search/docs/appearance/ai-features). The installed Next.js 16.3.4 docs were also consulted.

## Verification

`node --test --test-isolation=none tests/setup/seo.test.mjs` checks launch gating, URL validation and script escaping. `npm run test:ui -- tests/e2e/seo.spec.ts --output=tmp/seo-e2e` checks rendered metadata, crawler responses, Markdown discovery, JSON-LD and social image output against the local server. Use `SEO_TEST_BASE_URL` for a different test server, `SEO_EXPECT_INDEXABLE=true` for a launched production build and `SEO_EXPECT_ORIGIN` to assert its configured canonical origin. Provider release acceptance remains tracked separately in `docs/PLAN.md`.
