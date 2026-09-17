# Workspaces and teams

The sidebar dropdown lists joined workspaces and always offers Create workspace. Creation takes a name, assigns Owner, generates a permanent identifier, and selects the result. A browser-generated request UUID deduplicates retries. Dashboard URLs remain unchanged. Selection lives in an HTTP-only, SameSite=Lax cookie (Secure for HTTPS); every server request rechecks membership and falls back to the earliest remaining membership if the selection is stale. Forms and API-key actions submit explicit workspace IDs, so another browser tab cannot redirect a write by changing the shared cookie.

## Interface and roles

General contains the workspace name and read-only identifier with a gray background. Advanced groups Leave workspace and owner-only Delete workspace under Danger zone. Identifiers use `WRK` followed by ten uppercase letters/numbers, generated uniquely on the server and protected from edits in the database. The one-time format migration changes existing display identifiers without changing internal UUIDs or memberships. Team combines members and invitation history in a searchable table with All statuses, Active, Pending, Expired, and Revoked filters. All three tabs use the installed segmented controls and theme tokens. Account profile/authentication remain account-scoped; API keys remain workspace-scoped.

| Capability | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read workspace and teammate names/emails/roles | Yes | Yes | Yes |
| Rename; invite/resend/revoke Admin or Member invitations | Yes | Yes | No |
| Change/remove Admins and Members | Yes | Yes | No |
| Transfer ownership; delete workspace | Yes | No | No |
| Leave | Transfer first, or delete if alone | Yes | Yes |

Exactly one Owner is required per surviving workspace. A unique index prevents a second Owner and deferred constraints reject ownerless commits. Ownership transfer is a separate confirmed RPC: the current Owner becomes Admin and the selected active teammate becomes the sole Owner atomically. Competing/stale transfers cannot overwrite a new Owner. Owners and Admins can invite Admins or Members, with Member selected by default. The invitation's stored role controls acceptance and signup; unverified accounts have no workspace access even when invited as Admin. Pending invitations and unconfirmed signups cannot receive ownership. Only the current Owner can transfer ownership after acceptance and verification. Previously revoked Admin offers stay revoked; create a new invitation when needed.

An Owner with teammates must transfer ownership before leaving; Advanced explains this and disables Leave until transfer. A solo Owner's Leave opens a clearly labeled deletion confirmation, including pending invitations. It requires the current password and exact workspace name and preserves accounts/other workspaces. Pending invitations are not teammates capable of owning a workspace. The existing fallback and billing deletion protections still apply; merely clicking Leave never deletes data. For unconfirmed signups, the table shows Awaiting email verification: they can request a verification email from sign-in, while managers can revoke their access.

Every surviving account has a workspace. Removing/leaving/deleting the final membership atomically creates a personal workspace; simultaneous losses cannot duplicate it. Account deletion is the exception and never creates replacements. Departure or demotion to Member permanently revokes the user's keys and their outstanding issued invitations. Rejoining never revives an old key. Subsequent requests recheck access; already authorized in-flight requests can finish.

## Workspace logos

General allows Owners and Admins to upload, replace, or remove a workspace logo. Members can view it. The square image appears in the sidebar's current-workspace control, its collapsed rail, and the joined-workspace dropdown; workspaces without a logo keep the default icon. JPG, PNG, and WebP uploads are limited to 2 MB and 25 million input pixels. The server rejects animated images, applies orientation, crops to 256 × 256, strips metadata, and encodes WebP.

One bounded image (at most 128 KiB) is stored in the RLS-protected `workspace_logos` row. This deliberately keeps small branding assets in Postgres: replacement and workspace/account deletion can commit atomically without orphaned Storage objects. `set_workspace_logo` uses the lifecycle lock and rechecks current verified Owner/Admin permission; direct table writes are denied. The authenticated `/api/workspaces/[id]/logo` endpoint validates image dimensions/format and returns private, noncached responses. Only current verified teammates can read the image. Versioned URLs refresh replacements; pending forms reset when switching, and uploads carry their original explicit workspace ID.

## Invitation and email boundary

Private records store normalized recipient, workspace, the Admin or Member invitation role, SHA-256 token hash, seven-day expiry, inviter, acceptance/revocation, and send-attempt status. Only one pending record exists per workspace/email; existing members cannot be invited. Resend preserves the stored role, replaces the token/expiry, and invalidates the old URL. To change an outstanding offer's role, revoke it and issue a new invitation after the recipient cooldown. Expired offers may be resent; revoked offers have no actions and a fresh invite must be issued. Opening an email link never accepts it. Tokens travel in the URL fragment, are exchanged through a POST body for an HTTP-only invitation cookie, and are erased from history. Opening these links requires JavaScript.

Existing accounts sign in with the matching email and explicitly accept, keeping other memberships. A mismatched signed-in user sees Switch account. New invited signup validates the secret/email/expiry/role inside the Auth insertion transaction and creates only the invited membership. Metadata role/workspace claims alone are never trusted. Invalid context stops signup until the user explicitly abandons it. Ordinary signup retains personal-workspace bootstrap.

Verification blocks access until confirmation. A consumed signup invitation can resume from validated account metadata on another browser, even after its original expiry, only while that membership remains valid. Recovery retains the invitation cookie and returns to acceptance. Additional OAuth flows are not part of this slice.

`emails/workspace-invitation.html` is published by kickstart; `RESEND_TEMPLATE_WORKSPACE_INVITATION_ID` is saved in `.env`. Its declared variables are ACTION_URL, WORKSPACE, INVITER, ROLE, and EXPIRES. All four templates appear in `/preview/emails` in development. Template reconciliation, content aliases, receipt preservation, and read-only preflight remain in force. See [Resend templates](https://resend.com/docs/dashboard/templates/introduction).

An invitation send makes at most three attempts with the same attempt UUID/idempotency key. Provider acceptance records `accepted`; permanent rejection records `failed`; timeouts/lost responses remain `unknown`. Unknown/failed invitations remain visible with Resend. A later user resend is a new attempt and token. The UI's Sent label means provider acceptance, not inbox delivery. The raw secret is not stored for a background retry; process interruption leaves an actionable unknown state.

## Configuration and customization

Abuse policy is stored once in `private.workspace_policy`: five explicit creations/account/hour, 30 invitation sends/workspace/hour, and 60 seconds between sends to the same workspace/recipient (including revoked invitations). Change it through a new versioned SQL migration, then kickstart. Automatic personal fallback is exempt. Billing has no seat caps; each workspace has its own subscription. See BILLING.md.

To hide workspace/team controls for a simpler product, remove the WorkspaceSwitcher render and Workspace navigation item from `components/dashboard/app-shell.tsx` and remove the `/dashboard/workspace` route if desired. Keep `getWorkspace`, the dashboard authorization boundary, organizations/memberships, signup/deletion triggers, and workspace-scoped data/API keys. This is UI customization, not a different tenancy mode. Hiding controls does not disable their authorized server APIs; remove the matching actions/routes explicitly if the product must prohibit that capability. Existing automatic workspaces still function.

## Verification

- `npm run test:hosted`: transaction-rolled-back tenant, settings, workspace, and feedback isolation checks on the explicitly configured hosted target. Invitation-role checks cover Owner/Admin offers, Member denial, ownership restrictions, role-preserving resend, existing/new account acceptance, forged metadata, and unverified Admin denial.
- `node scripts/test-workspace-concurrency.mjs`: disposable accounts for concurrent acceptance, owner departures, final-membership losses, and acceptance/revocation races.
- With `RUN_HOSTED_WORKSPACES=true`, `npm run test:ui -- workspace-logo.live.spec.ts` covers malformed/oversized input, square output, persistence, switcher/rail display, member access, Admin removal, stale-tab upload targeting, departure/deletion cleanup, and mobile dark mode. The hosted SQL suite also verifies direct logo permission boundaries and unverified-user denial.
- Set `RUN_HOSTED_WORKSPACES=true` for the process, then `npm run test:ui -- workspaces.live.spec.ts invitation-link.spec.ts`: real browser lifecycle, two-tab writes, confirmation/recovery, permissions, fallback, mobile/dark mode, keyboard tabs, and test-sender rejection. The email-status test requires the configured Resend test sender and cannot establish production delivery.
- Optional `WORKSPACE_DELIVERY_TEST_EMAIL` enables an actual invitation send to an explicitly authorized recipient. Leave unset unless that destination and email are authorized. The test revokes its invitation and deletes its disposable workspace afterward. Provider events and recipient receipt are separate evidence.

All hosted scripts require HOSTED_TEST_PROJECT_REF to match SUPABASE_PROJECT_REF and the configured URL. They operate only on their fixtures; no shared database reset is used. Browser traces/video are off and explicit screenshots avoid passwords and tokens. Verify actual verification-on signup email delivery and fresh-project installation; generated confirmation-link checks do not satisfy those acceptance requirements.
