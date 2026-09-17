# Architecture

One Next.js App Router application runs locally or on Vercel. Hosted Supabase provides Postgres, Auth, avatar storage and Edge Functions. Stripe handles per-workspace subscriptions; Resend sends templated email. The optional AI example uses OpenRouter from a server route.

## Repository map

| Path | Responsibility |
| --- | --- |
| `app/(auth)/`, `app/actions/` | Authentication screens and server actions |
| `app/dashboard/`, `components/dashboard/` | Protected workspace application and shell |
| `app/admin/`, `lib/admin/` | Operator access, read-only customer reporting, operator membership |
| `app/api/`, `lib/integrations/`, `lib/mcp/` | API-key REST and scoped OAuth/MCP operations |
| `lib/auth.ts`, `lib/workspaces.ts`, `lib/workspace-session.ts` | Verified sessions and selected-workspace rules |
| `lib/supabase/` | User-scoped clients and narrowly scoped privileged helpers |
| `lib/billing/`, `config/billing-seed.json` | Subscription synchronization, entitlement and initial catalog |
| `lib/ai/`, `components/ai/`, `app/api/ai/` | Removable AI example |
| `supabase/migrations/`, `supabase/functions/` | Immutable database history and hosted functions |
| `scripts/kickstart/` | Read-only preflight, provider provisioning and retry/recovery |
| `emails/` | Source templates published by kickstart |
| `config/marketing.ts`, `config/legal.ts`, `config/seo.ts` | Public copy, sample legal text and discovery policy |
| `content/docs/`, `lib/docs-source.ts` | Your product’s public documentation |
| `tests/setup/`, `tests/database/`, `tests/e2e/` | Local orchestration, hosted SQL and browser verification |
| `docs/` | Private repository engineering guides; never public Markdown sources |

## Authorization

Ordinary Supabase requests carry the user’s session and remain subject to RLS. Workspace selection is a validated HTTP-only cookie; writes carry an explicit workspace ID and recheck current permissions. Ordinary signup atomically creates a workspace and owner membership. Invited signup relies on validated private invitation state and creates no personal workspace.

Exactly one owner survives per workspace. Lifecycle operations share the established advisory-lock ordering, preserve fallback memberships and billing deletion protections, and revoke departed/demoted users’ API keys. UI visibility never grants authorization.

The server-only Supabase secret key is restricted to documented API authentication, Auth deletion, email receipts and guarded billing/AI protocols. Operator access comes from protected membership plus a current confirmed first-party session, not a profile flag or workspace role. Customer records remain read-only in admin.

## Billing and AI

Each workspace pays separately. Stripe test catalog ownership metadata and durable customer mappings enable safe retry and reconciliation. Signed webhook handlers run in hosted Supabase, fetch authoritative subscription state, and commit it under a fenced lease; duplicates and out-of-order events cannot regress access. Scheduled reconciliation repairs missed events. Admin financial reporting remains incomplete if accounting fields or history are absent.

AI gives a workspace 100 credits once, independently of billing. Database reservations and idempotent settlement serialize spending, preserve saved history, and recover abandoned generations. Removal instructions are in [AI.md](AI.md).

## Setup and deployment

New installations begin with three credentials; [KICKSTART.md](KICKSTART.md) describes account preflight, US project creation, deferred project checks, sender discovery and resource installation. A read-only probe cannot prove write permissions. Preserve `.kickstart/` receipts and `.secrets/`; changed targets or unexpected provider drift stop setup.

Migrations use the hosted Management API, transactions, advisory locks and `private.kickstart_migrations` checksums. Do not mix in Supabase CLI migration history or rewrite applied SQL.

Development and production share the configured hosted Supabase project and Resend setup. Deployment activates the production Auth/email/MCP origin, uploads only runtime variables, and leaves previews disabled. GitHub/Vercel setup tokens never enter the application runtime. [DEPLOYMENT.md](DEPLOYMENT.md) explains the separate deployment repository and the guarded initial-source upload.

## Public content

Public pages use the shared SEO policy, explicit route registration and launch guards. Published blog content is global editorial data, never tenant data. `/docs` and public Markdown export only approved product content. Internal guides, environment files, receipts and workspace records must remain outside those loaders.
