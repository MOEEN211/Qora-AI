# Project instructions

This is the buyer’s independent SaaS application. Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/PLAN.md` before implementation. The developer manual is https://shipandscale.dev/docs; `content/docs/` is the buyer’s product-documentation example.

## Provider and data boundaries

- Supabase is always hosted. Never start local Supabase, Docker or a Docker-dependent migration/test workflow. Next.js runs locally and on Vercel.
- Use only the project explicitly configured in this copy’s private `.env` and matching `.kickstart` receipts. A new installation uses the buyer’s provider accounts. Never infer or reuse a seller/demo project.
- All persistent database changes belong in versioned SQL migrations. Released/applied migrations are immutable; corrections require new migrations. The installer uses the Management API and its own checksum ledger, not Supabase CLI migration history.
- Never reset a shared/production database. Run hosted checks only against an explicitly authorized dedicated test target.
- Ordinary signup creates a workspace; valid invited signup joins only the invited workspace. Keep one organization-based model. Enforce membership and sensitive permissions on the server/database and test cross-tenant reads/writes.
- Keep ordinary Supabase calls user-scoped. Privileged clients and security-definer RPCs require narrow justification. `SUPABASE_SECRET_KEY` is server-only; only intentionally public values use `NEXT_PUBLIC_`.
- Never commit credentials, receipts or logs. Kickstart must finish all applicable read-only preflight before provisioning; state which permissions require a write to verify. Preserve retry/account/project/mode binding and fail on drift rather than overwrite buyer changes.
- Define plan values once. The seed initializes Stripe test resources; the owned test catalog is the authoring source afterward. Workspace subscriptions are independent; no seat limits or subscription-funded AI credits.
- Preserve ownership locks, billing deletion guards and last-operator protection. Admin uses normal login plus current-session/operator checks. Customer data is read-only; equal operators may manage operator membership. Do not introduce impersonation, paid-access overrides, credit adjustments or feature-flag management.
- The optional AI example must remain removable without breaking auth, workspaces or billing; see `docs/AI.md`.

## Implementation and verification

- Preserve shadcn preset `bIkeypU` (Base UI/Vega, neutral, Inter, Lucide) and all 61 installed UI component files unless the buyer explicitly requests a design change.
- Read `docs/SEO.md` before public-page/discovery edits. Use `publicMetadata`, register actual pages in `config/seo.ts`, preserve noindex guards and exclude internal/workspace data from public Markdown exports.
- `/preview` and `/setup` are development-only. Never add an authentication bypass to `/dashboard`.
- Read the relevant installed guide in `node_modules/next/dist/docs/` before Next.js changes; installed APIs may differ from prior versions. Check current official provider documentation before integration changes.
- Keep dependencies pinned and update `package-lock.json` with dependency changes.
- Run meaningful tests for tenancy, billing synchronization, concurrent quota use and retryable setup, plus browser checks for changed UI. Static checks alone do not establish hosted acceptance.
- Update `docs/PLAN.md` with actual checks and remaining limitations. Never claim an email, payment, provisioning or buyer acceptance flow passed without exercising it.

## Commands

- `npm ci`: install pinned dependencies; Node.js 24 LTS is the reference runtime.
- `npm run dev`: local Next.js, hosted Supabase.
- `npm run lint`, `npm test`, `npm run build`, `npm run typecheck`: secret-free local checks; build generates route types before a fresh standalone typecheck.
- `npm run kickstart:check`: read-only provider preflight; `npm run kickstart`: provision after preflight.
- `npm run kickstart:deploy -- --check`: read-only deployment preflight; omit `--check` to provision/deploy the buyer’s application.
- `npm run test:ui`: Chrome checks against a running server. Hosted browser suites require explicit opt-in and target guards.
- `npm run test:hosted`: transaction-rolled-back SQL tests against the explicitly selected hosted test project.

Preserve private `.env`, `.kickstart/` and `.secrets/` state. `AUTH_EMAIL_VERIFICATION` defaults to false and requires kickstart to change hosted behavior. `APP_URL` is active; `APP_URL_DEV` and `APP_URL_LIVE` are references until the appropriate deployment/setup operation uses them. Deployment changes the shared hosted Auth/email/MCP origin; previews remain disabled. Do not silently restore a local origin on a deployed project.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
