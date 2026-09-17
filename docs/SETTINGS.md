# Settings and workspace API

`/dashboard/account` contains General, Security, Notifications, and Billing, using the installed Base UI shadcn preset. `/dashboard/workspace` uses the same segmented treatment for General, Team, and Advanced. See WORKSPACES.md for creation, switching, invitations, roles, leaving, and workspace deletion, and PLAN.md for completed checks.

## Setup and runtime

Fill `SUPABASE_SECRET_KEY` with a server-only `sb_secret_...` key from your dedicated project's Settings > API Keys. Kickstart validates it before provisioning. This is a Next.js runtime credential for API authentication and Auth account deletion. It never goes into browser props/bundles or email Edge Function secrets. `SUPABASE_ACCESS_TOKEN` remains setup-only. Run kickstart to install the settings migrations; Supabase remains hosted.

## General and security

Workspace General shows an immutable `WRK` plus ten-character identifier on a muted gray field. Advanced groups Leave workspace and owner-only Delete workspace under Danger zone. Exactly one Owner is permitted: transfer ownership in Team to become Admin before leaving, or use the explicitly confirmed deletion flow when alone. Team supports search and Active/Pending/Expired/Revoked status filters; Owners and Admins can invite Admins or Members (Member by default). Only the Owner may transfer ownership to an accepted, verified teammate; pending invitations cannot receive ownership. See WORKSPACES.md for edge cases.

Full-name changes refresh the profile and sidebar. Email remains read-only pending a separate email-change confirmation flow. JPG/PNG/WebP photos up to 2 MB are decoded by Sharp with a 25-million-pixel input bound, stripped of metadata, cropped/resized to 256×256, and saved as WebP. Private storage policies allow only the verified owner to read/write `<user-id>/avatar.webp`; profiles cannot reference another user's path. Signed display URLs last one hour.

Settings password changes require the current password, a different new password of 12–128 characters, and confirmation. An isolated Supabase client verifies the current password and disposes of its temporary session. The user-scoped server client performs the update. Success clears and collapses the form and shows confirmation in Settings. Email recovery remains a separate flow that redirects to the dashboard after reset. Google/magic-link users can follow Set a password by email in Security to establish a password before password-confirmed changes or deletion; those guards are unchanged.

Deletion requires the current password and typing DELETE. The dialog names personal workspaces to be deleted. The server removes the avatar through Storage, then calls Admin Auth to delete the signed-in user. Inside Auth's deletion transaction, a database trigger requires transferring ownership of shared workspaces first, preserves transferred workspaces, and removes sole-member owned workspaces. Profile, memberships, and every API key created by the deleted user cascade away. Local cookies are cleared and login shows confirmation. If Auth deletion fails after photo cleanup, the account remains retryable but its photo may already be removed.

Stale access tokens are denied because tenant policies recheck that the Auth user still exists. Deleting a creator removes their API keys. Lifecycle mutations and account deletion now acquire the shared workspace lifecycle advisory lock before organization-row locks. Additional storage buckets require explicit API cleanup before Auth deletion. Account deletion revokes outstanding issued invitations and never creates fallback workspaces.

Billing adds a tab for the selected workspace and a separate workspace-deletion trigger over private billing state. Pending Checkout and nonterminal subscriptions block workspace deletion, including account deletion that would remove that workspace. Cancel first, wait through the paid period, and refresh billing before deletion. Shared/transferred workspace subscriptions remain intact. The old guard for an unexpected public.subscriptions table stays defensive; the actual cache is private.billing_subscriptions. Hosted billing acceptance remains pending; see BILLING.md.

The server-only key also records invitation send status and invokes guarded workspace deletion after password verification. Ordinary workspace reads and team actions use the signed-in user's client. API-key forms carry explicit workspace IDs; switching clears pending forms and revealed secrets. Leaving, removal, and demotion to Member permanently revoke that user's workspace keys, even after rejoining or promotion.

Workspace General also includes square workspace-logo upload/replacement/removal for Owners and Admins. Verified teammates see it in General and the sidebar switcher. The same 2 MB input and 256 × 256 output limits apply, but these small assets use an RLS-protected database row and an authenticated, noncached image route. Workspace/account deletion cascades atomically to the logo; it needs no extra Storage cleanup. Switching resets upload state and stale-tab uploads retain their explicit workspace target. See WORKSPACES.md.

## Notifications

The Notifications tab uses the same cards, section grid, typography, compact segmented controls and Base UI switches. Both Email notifications and In-app notifications default to on at signup and save individually; the server targets the authenticated account rather than accepting a user ID. Saved changes survive reload and workspace switching. Failed saves keep the persisted value with retry feedback. In-app opt-out preserves the current inbox while preventing new notification rows. Welcome/invitation email attempts check the saved email preference; verification and recovery messages remain available. See NOTIFICATIONS.md for the migration, private lookup, retry/suppression semantics and buyer extension rules.

## API contract

Integrations places the shared `DocumentationButton` at the right of the API keys/MCP tab row. Its label and destination follow the selected tab: Open API documentation links to `/docs/api`, and Open MCP documentation links to `/docs/mcp`. On narrow screens the visible labels shorten to API docs/MCP docs to keep the controls on one row; full accessible labels remain. The local MCP message explains that localhost points to the current computer, gives publishing as the next step for Claude, and distinguishes testing with a locally running client. OAuth instructions explicitly require signing in and approving workspace access; the API example uses `WORKSPACE_API_KEY`, matching the public guides.

Keys belong to the active workspace. Owners/admins can create, list, and revoke them; members cannot. Permissions are read-only or read/write, with 30/90/365-day expiry or Never (no expiration). The default remains 90 days. Never stores a null expiry and counts toward the active-key limit; revocation, creator membership checks, account deletion, and rate limits still apply. Existing keys retain their chosen expiry. The database generates 256 random bits and reveals the `forma_...` secret once. Only a SHA-256 hash and display prefix are stored in a private table. The reveal dialog discards its secret when closed. If a response is lost, inspect the key list and revoke the inaccessible key before creating another.

The 20-active-key limit is serialized using an organization lock. Authorization checks expiry, revocation, and the creator's current verified owner/admin membership. Revocation stops subsequent authorization; an already-authorized in-flight request may finish. A per-key fixed-window limit allows 60 requests per minute, enforced atomically in Postgres. Add infrastructure-level controls for invalid-key traffic before public launch.

- `GET /api/v1/workspace`: returns the key's workspace ID, name, slug, and creation date in a `data` object.
- `PATCH /api/v1/workspace`: accepts only `{ "name": "New name" }` with read/write permission; updates only the key's workspace.
- Authenticate with `Authorization: Bearer <key>`. Cookies are not accepted. Responses use `Cache-Control: no-store`.
- Errors: 401 invalid/expired/revoked key; 403 insufficient permission; 429 quota exceeded with Retry-After 60; 400/413 invalid/oversized body; 503 service unavailable.

The example API exposes workspace details and renaming only. Extend permissions before exposing new product data. The server-only key is used for key exchange and explicitly workspace-filtered queries, never ordinary application data reads.

The sidebar Integrations item opens `/dashboard/integrations`, with separate compact **API keys** and **MCP** segmented tabs. API keys contains key creation/revocation and a link to API documentation; the API base URL is omitted from this tab. MCP explains Model Context Protocol in plain language, displays a copyable server URL and connection steps, and links to `/docs/mcp`. The account menu also links to Documentation at `/docs`. Older Settings links with `tab=api` or `tab=api-keys` redirect to Integrations; `tab=mcp` redirects to its MCP tab. Settings and Workspace use the same compact, content-sized tab style. MCP supports the same keys plus OAuth sign-in and explicit workspace consent. Connected applications lists the signed-in user's grants across workspaces. Disconnect blocks access locally before provider cleanup. **Access removed → Finish disconnect** allows cleanup retries after provider failures or membership changes. No key or OAuth token is shown in this list. See [API/MCP implementation and extension](API-MCP-PLAN.md).

## Tests and advisor review

Operator accounts also have an Admin link in the account menu. Operator membership is separate from workspace roles. Account-deletion preflight checks whether the account is the last operator before storage removal; the Auth deletion transaction enforces the same guard with the existing lifecycle lock. Add another operator first. See ADMIN.md for authenticator and access management.

After successful API/MCP workspace operations, the server-only client invokes the narrow `report_integration_activity` RPC with the already-authorized workspace ID and source. It cannot grant operator access. Ordinary dashboard activity uses a user-scoped RPC; operator browsing does not count as customer activity.

Feedback follows the same deletion lifecycle: authored reports/requests and the user's votes cascade away; requests attributed to a deleted personal workspace and their votes are removed. See FEEDBACK.md. The sidebar account menu also links to Settings and now contains sign out.

`npm run test:hosted` checks tenant/key/avatar isolation, key scope/expiry/revocation/rate limits, deletion ownership guards, cascades, and stale-user denial. SQL fixtures roll back.

Set `RUN_HOSTED_SETTINGS=true` for the process and run `npm run test:ui -- settings.live.spec.ts` to exercise real settings forms, API calls, and deletion on a disposable confirmed account. `HOSTED_TEST_PROJECT_REF` must match the configured project. Cleanup targets only that fixture; no email is sent and the owner's account is untouched. Traces/video are disabled and screenshots exclude entered credentials and revealed keys.

Advisor notes: no policies on `private.api_keys` is intentional deny-by-default. The four authenticated SECURITY DEFINER RPCs deliberately enforce current-user/workspace checks; the key-exchange function is service-role-only. Public execution of the provider's RLS event-trigger helper is revoked separately. Leaked-password protection is an existing hosted Auth setting to review before production: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
