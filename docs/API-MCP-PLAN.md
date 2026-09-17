# API, MCP, OAuth and developer documentation

The included REST/MCP implementation exposes workspace read/rename with server-enforced scopes. Configure and verify it on your own hosted installation. Billing enablement follows `config/billing-seed.json`.

## Product contract

The example exposes two useful operations backed by the application's real workspace data:

| Operation | REST | MCP tool | Permission |
| --- | --- | --- | --- |
| Read the connected workspace | `GET /api/v1/workspace` | `get_workspace` | Read |
| Change its display name | `PATCH /api/v1/workspace` | `rename_workspace` | Read/write |

Keys and OAuth grants each authorize one workspace, even if the person belongs to several. Read and rename operate only on that workspace; a supplied ID cannot broaden access. The `slug` property contains the permanent `WRK...` identifier shown in the app.

Read takes no input. Rename accepts only a trimmed 2–80-character `name`; it never changes the ID, readable identifier, memberships or billing. REST retains its original `{data: ...}` response envelopes and PATCH's smaller field set. MCP returns JSON text plus validated structured content. Changes persist in Supabase and appear when the dashboard reloads. No model generation or AI credit is needed to execute the tools.

## Architecture and extension points

- `config/integrations.json`: API, MCP and OAuth toggles and the operation allowlist.
- `lib/integrations/schema.ts`: shared strict Zod input/output schemas, descriptions and permission requirements.
- `lib/integrations/auth.ts`: bearer parsing, key exchange or OAuth JWT verification, and current grant/session/membership checks.
- `lib/integrations/workspace.ts`: shared service, with all privileged queries explicitly filtered by the authenticated workspace.
- `lib/integrations/http.ts`: bounded bodies, safe errors, origin validation and response headers.
- `lib/mcp/server.ts`: binds one request's principal to the shared service.
- `lib/mcp/handler.ts`: official SDK registration, protocol adapters, annotations and output handling. A fresh server is created per request; no process-global authenticated MCP server exists.
- `app/api/v1/*`: small REST adapters. `app/api/openapi` generates OpenAPI 3.1 schemas from the shared definitions and includes enabled operations only.
- `scripts/kickstart/integrations.mjs`: supported-operation validation, read-only provider preflight, audience configuration and permission verification.

MCP calls the shared service directly, not the app's REST URL. Authentication and quota consumption happen once per incoming transport request. The ordinary dashboard remains on user-scoped Supabase sessions and RLS. Never expose arbitrary tables, SQL, fetch URLs or table-name arguments through this service.

To extend the workspace example, add its strict schemas/descriptor, shared handler, configuration and installer allowlists, optional REST/OpenAPI adapter, documentation and permission/isolation checks. New product domains need explicit new grants and consent/key controls; existing workspace read/write permissions must not automatically grant document, member, billing or AI access. The complete buyer recipe lives at `/docs/extending`.

## Authentication and protocol

API keys retain the existing one-time secret reveal, hash-only storage, 30/90/365-day or Never expiration, 20-active-key cap, owner/admin management and 60-request-per-minute database limit. The migration adds permission and credential identity to `consume_api_key` without replacing keys. REST has a narrow compatibility path for the previous RPC result during upgrades; MCP requires the new migration.

REST accepts application keys only. MCP accepts the same keys or native Supabase OAuth access tokens. Cookies, ordinary user JWTs, publishable/secret keys and management tokens are not external application credentials.

The implementation pins the official MCP SDK v2. It serves stateless Streamable HTTP at `/api/mcp`, supporting both legacy initialization and the current discovery protocol. The server returns JSON for these short tools, has no subscription streams, and rejects batches. Authenticated GET/DELETE return 405; unauthenticated requests return 401 with OAuth protected-resource discovery when enabled. Read-only connections omit the rename tool; service permission checks independently reject writes.

MCP validates Origin when supplied and allows only the configured app origin (plus the matching localhost alias in development). Native clients can omit Origin. Body limits are 16 KiB for MCP and 2 KiB for REST rename. Responses are noncached. REST and transport errors use safe messages; 429 includes `Retry-After: 60`. Invalid-key ingress controls must be configured at the deployment edge before public release; the template does not claim a global distributed unauthenticated limiter.

## OAuth and Claude

Supabase owns dynamic client registration, authorization codes, PKCE, token issuance and refresh. The template owns `/oauth/consent` and workspace permissions. Protected-resource metadata is served at `/.well-known/oauth-protected-resource/api/mcp`, with a root alias, and points to Supabase's authorization-server metadata.

The browser signs in with its ordinary session. The consent page gets the requesting client's name, redirect URI and identity scopes from Supabase. Approval re-fetches the authorization details server-side and allows only current verified owners/admins to select one of their workspaces. Provider authorization IDs are opaque URL-safe strings, not UUIDs. Redirects come from the provider response, never a form-supplied destination. `strict-origin` referrer metadata strips request identifiers while preserving native form CSRF behavior.

Supabase currently exposes identity scopes rather than custom workspace scopes. Native scope text such as `openid` does not grant workspace access: `private.mcp_connections` records read or read/write consent. OAuth JWT verification requires the hosted issuer, asymmetric ES256/RS256 signature, the exact app MCP audience, an active client/session, `role: anon` and a signed connection ID. Every request rechecks the creator's verified owner/admin membership and current grant in the database.

The custom access-token hook changes only OAuth-server tokens carrying `client_id`. It sets the MCP audience and unprivileged `anon` database role and adds `forma_connection`. Ordinary login/refresh claims remain unchanged. This prevents OAuth tokens from acquiring the dashboard's ordinary table/RPC privileges. `supabase_auth_admin` can execute the invoker hook and access only the required private grant/settings/session tables. Service-only exchange RPCs are denied to ordinary clients.

Refresh sessions are permanently tied to their original consent generation. Reconnecting cannot revive a revoked generation. Removing/demoting a member revokes their grants. Account deletion removes its grants; workspace deletion revokes access and retains a disconnected app record for provider cleanup, with no workspace ID or live workspace name exposed. Disconnect blocks application access before requesting provider token cleanup. Revoked connections with unfinished cleanup remain visible as **Access removed → Finish disconnect**; completed rows disappear while their session bindings remain stored. This also lets users clear native consent after role changes before reconnecting.

Supabase currently labels its OAuth server beta. Claude custom connectors require an app origin reachable over HTTPS from Claude's cloud. A successful local OAuth/SDK test does not establish a completed connection in the Claude product. That final deployed client check remains a release acceptance item.

## Installation and recovery

All enabled provider preflights finish before any provisioning. The OAuth probe checks the hosted configuration fields, existing hook ownership and public asymmetric signing keys. It rejects a foreign buyer token hook instead of overwriting it. SQL is installed with the existing Management API checksum ledger and versioned migrations; Supabase stays hosted, with no Docker or local database dependency.

The initial migration is additive to existing API keys. Follow-up migrations handle retryable disconnect cleanup, active client/session binding, and connection visibility after workspace removal/deletion. Released migration contents remain immutable. An interrupted run resumes through the same receipts/checksums without recreating unrelated resources. The hook audience is configured after its tables/functions exist and before native OAuth is enabled.

There is one active `APP_URL`/MCP audience per Supabase project. `APP_URL_DEV` and `APP_URL_LIVE` are references. An intentional origin change requires the matching kickstart configuration and reconnecting OAuth clients. Do not configure simultaneous local/deployed OAuth audiences on the same target. Keep management credentials out of app deployment; no additional runtime secret is introduced by OAuth.

Existing Settings remain usable if integration listing is temporarily unavailable; the MCP tab reports that condition. Disabling API or MCP returns 404 on its surface. Disabling OAuth stops consent/discovery/token acceptance without silently mutating the buyer's hosted Auth configuration. Remove capabilities before removing unused UI/dependencies; do not delete released migrations or shared auth/workspace/billing tables.

## Fumadocs

The public documentation has 17 focused pages grouped under Getting started, REST API, MCP server, and Build & extend. Native folder metadata creates expandable submenus; REST API → Workspaces contains separate list, get, and rename references. Original top-level guide URLs have permanent redirects; `/docs/api` and `/docs/mcp` keep their original paths.

The documentation layout uses scoped styling in `app/docs/docs.css`, the shared application brand and theme, breadcrumbs, active page contents, previous/next navigation, and search. The shared MDX registry adds Steps, persistent language Tabs, Accordions, Files, TypeTable, and small template-specific endpoint and icon-card components. The component cookbook and authoring guide show buyers how to extend these patterns.

`/api/docs/markdown/[...slug]` exports a public guide; `/llms.txt` and `/llms-full.txt` provide a page index and complete public content. Fumadocs processed Markdown plus explicit server component renderers preserve code, callouts, field tables, tabs, and troubleshooting text for Copy Markdown. All exports use only the public MDX source and are generated at build time; they do not read arbitrary paths, application credentials, internal records, or workspace data. The workspace MCP server remains the authenticated product integration described above.

The real Fumadocs site is public at `/docs`, with MDX in `content/docs`, ordering in `meta.json`, source configuration in `source.config.ts`, and its loader in `lib/docs-source.ts`. `/api/docs/search` searches only public MDX pages. `npm ci` runs `fumadocs-mdx` through `postinstall`; `.source/` is generated and ignored. The Next.js MDX plugin is configured in `next.config.mjs`.

Guides cover API usage, authentication, Claude/MCP setup, safe errors/retries, extension, buyer installation and writing Fumadocs pages. Internal `docs/` files and `.env` contents are not ingested. Integrations separates API keys and MCP into compact tabs with copyable URLs and setup documentation. The sidebar account menu includes Documentation. Fumadocs uses its neutral theme and the app's existing theme provider; the shadcn preset tokens are preserved.

## Verification commands

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run test:hosted
npm run test:ui -- mcp.protocol.spec.ts integrations.spec.ts
```

With the dev server running and `HOSTED_TEST_PROJECT_REF` matching the authorized dedicated project, explicitly set `RUN_HOSTED_INTEGRATIONS=true` in the test process and run `npm run test:ui -- integrations.live.spec.ts`. It creates disposable users/workspaces and one dynamic OAuth client, checks both interfaces and the native OAuth browser/token flow, then cleans up only those fixtures. It disables credential recordings. SQL fixtures are transaction-rolled-back. Provider-role execution is verified by real token exchange because managed Postgres cannot `SET ROLE supabase_auth_admin`.

## Provider references checked during implementation

- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [Supabase OAuth server setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)
- [Supabase OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [Claude connector authentication](https://claude.com/docs/connectors/building/authentication)
- [Fumadocs Next.js installation](https://www.fumadocs.dev/docs/manual-installation/next)
- [Fumadocs MDX](https://www.fumadocs.dev/docs/mdx/next)
