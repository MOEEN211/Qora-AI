# Public pages

The starter includes `/`, `/pricing`, `/faq`, `/contact`, a blog, example legal pages and product documentation. Replace the sample starter positioning and demonstration content with your own product before launch. Workspace subscription prices are distinct from the license price you paid for this source.

## Customization

- Edit `config/marketing.ts` for public copy, feature lists, FAQs and navigation content.
- Edit public components and assets deliberately while preserving the installed Base UI/Vega tokens.
- Edit `config/legal.ts` for your actual terms and privacy notice; the examples are visibly sample/noindex.
- Edit `content/docs/` for your product documentation. The starter manual belongs at https://shipandscale.dev/docs.
- Follow [SEO.md](SEO.md) for real public-route registration, metadata and launch indexing.
- Follow [BLOG.md](BLOG.md) for hosted editorial content and thumbnail replacement.

The landing and pricing pages read the shared application billing catalog. Before installation, the seed is display-only and cannot initiate a payment. Authenticated Checkout remains restricted to workspace owners/admins. The sample explorer uses local component state and makes no workspace writes.

## Contact and consent

Set server-only `CONTACT_TO_EMAIL` to your chosen inbox and configure Resend for that recipient. Contact submissions validate bounded fields, use a fixed recipient and a visitor reply-to, and report provider acceptance separately from inbox delivery. The form remains unavailable until configured. Add distributed ingress limits before launch; process-local throttles are only a backstop.

The example cookie-consent component saves an explicit accepted/declined value locally. It does not activate tracking or replace your legal/privacy requirements. Review actual cookies and integrations in your customized product.

## Verification

Run the marketing, public-pages, SEO and theme browser suites against a running local server. Verify real contact delivery separately. Replace sample testimonials and examples with your own substantiated content. Keep indexing off until public content, origin, accessibility and mobile layouts are ready.
