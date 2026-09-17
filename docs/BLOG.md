# Blog and sample legal pages

The public journal lives at `/blog`, with individual stories at `/blog/[slug]`. It uses the installed shadcn/Base UI controls, Inter, and existing neutral theme. The shared marketing navigation and footer link to it; the footer also links to `/privacy` and `/terms`.

## Storage and installation

`public.blog_posts` stores titles, slugs, excerpts, categories, author names, publication state, dates, reading time, thumbnail paths, and article sections. This is global editorial content for the buyer's site, not customer workspace data. Ordinary accounts, including workspace owners, cannot edit it. No admin writing panel is introduced.

Migration `20260914140000_public_blog.sql` creates the table, RLS, explicit read-only grants, publication policy, index, and three example articles. Ordinary `npm run kickstart` discovers it automatically after all required read-only provider checks pass. The existing project-scoped checksum ledger installs it once; reruns do not overwrite edits or restore deleted examples. Keep released migrations immutable. Schema corrections belong in a new migration, using this project's Management API runner rather than CLI migration history.

The anonymous publishable-key reader never uses customer cookies or the secret key. The database exposes only `published` rows whose `published_at` is in the past or present. Drafts and scheduled rows remain hidden from both anonymous visitors and signed-in customers. Reads are not cached between requests, so unpublishing takes effect on the next request. Previously public content cannot be recalled from visitors who already downloaded it.

## Authoring

Use the configured project's Supabase Table Editor or SQL Editor as the database operator. Add a row with a unique lowercase hyphenated `slug`, a title, excerpt, category, author, reading time, and content. Keep `status` as `draft` while editing. Set `status` to `published` and `published_at` to your chosen timestamp to publish or schedule it. No application deployment is needed for text changes.

The content column is a JSON array, with this shape:

```json
[
  {
    "heading": "Your first section",
    "paragraphs": ["A paragraph of plain text.", "Another paragraph."]
  }
]
```

Use 1–40 sections. Each heading is 1–180 characters; each section contains 1–20 paragraphs of 1–6,000 characters. Text is rendered as escaped React text, never executable MDX or raw HTML. The reader validates content before rendering; malformed operator-authored content produces a recoverable error rather than unsafe output. To add rich content later, extend the validator and renderer together.

Thumbnails are repository assets under `public/blog`, referenced as `/blog/your-image.png` (also `.webp` and `.jpg`). New assets require deployment. This keeps setup independent of public Storage buckets or remote image hosts. All three examples share `public/blog/forma-journal.png`. Change author and thumbnail labels in the components when rebranding; `APP_NAME` controls shared site branding.

The listing fetches nine summaries at a time plus a next-page sentinel, ordered by publication date and slug. Article bodies are fetched only for their own page. Empty, unavailable, and missing-story states are included.

## Sample legal text

Edit `config/legal.ts` for both documents. They are visibly labeled samples and remain `noindex`. Replace bracketed business, contact, effective-date, retention, jurisdiction, refund, and other placeholders. Confirm every disclosure reflects enabled services, AI behavior, tracking, and real operating practices. Obtain appropriate legal review before removing the sample notice. The terms describe application use; they do not provide a license to resell the starter source.

The privacy structure was checked against the [ICO's privacy-information guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/); it is not a jurisdiction-specific compliance guarantee. Database permissions follow [Supabase's RLS and grants guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Artwork provenance

Generated with the built-in image generation tool and copied into the repository at `public/blog/forma-journal.png`. The prompt requested a wide 1536 × 1024 premium grayscale thumbnail: light-gray matte background, a small centered charcoal Forma mark of exactly three separate rounded bars (left shortest, middle tallest, right medium), ample empty space, subtle paper texture and diffuse light; no text, extra objects, borders, or watermarks. The actual generated mark is a stylized interpretation of the brand.

## Checks

`npm test` includes setup-verification failure checks. `npm run test:hosted` includes transaction-rolled-back tests of public reads, hidden drafts/scheduled rows, and denied insert/update/delete for anonymous and customer roles. `npx playwright test tests/e2e/blog.spec.ts` checks the three installed examples, article navigation, missing/empty states, legal placeholders, mobile layout, and dark mode against the running local application and hosted Supabase.
