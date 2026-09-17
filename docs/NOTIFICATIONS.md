# Account notifications

Popover messages use two compact lines: a single-line title and single-line body preview, with ellipses for overflow. Full content and dates appear on the notification page.

The dashboard header has a bell next to the light/dark switch. Its dot and accessible unread count reflect the signed-in account's unread notifications. Opening the popover shows the five newest messages and does not mark them read. Clicking a message marks it read and opens `/dashboard/notifications`, anchored to that message. View all notifications opens the same page without marking anything read.

The centered inbox shows full messages, newest first, with 20 messages per page and Previous/Next navigation. Each unread message has a Mark as read control. Mark all as read in either the popover or page updates every unread message for the account, including older pages. Read messages remain visible. Dates use UTC consistently across server and browser. Loading failures show a retry action; an unsuccessful update does not claim success.

Notifications belong to an account, independently of workspace selection, role, subscriptions, or AI. The welcome message is an in-app example, separate from welcome email delivery or email preferences. Ordinary and invited Auth signups get exactly one welcome notification in the signup transaction. With email verification enabled, the notification exists immediately but cannot be read until verification, matching the dashboard's authorization rules.

The separately implemented notification preferences default to enabled for new accounts. Turning off in-app notifications suppresses future inserts while retaining existing messages and their read status; email preferences are independent. See SETTINGS.md for those controls.

## Notification preferences

Settings → Notifications contains independent Email notifications and In-app notifications switches. Each saves automatically, shows pending/saved/error feedback, and preserves the last saved value after a failed request. Preferences belong to the account across every workspace. New accounts always start with both values true, including invited/unverified signups; user-editable signup metadata cannot override these defaults. Existing accounts receive the same defaults at installation.

`20260914130001_notification_preferences.sql` creates the RLS-protected `notification_preferences` table. Verified users may read only their own row and update only its two booleans; no client may insert/delete preference rows or change their owner. Account deletion cascades to preferences. The preference bootstrap trigger runs before welcome creation in the same Auth transaction.

A BEFORE INSERT trigger on `notifications` reads and locks the recipient's preference row. Turning in-app notifications off suppresses all future insertions, including trusted backend writers. Re-enabling affects new notifications only; skipped messages are not queued or replayed. Existing messages/read states remain visible. The template creates only the signup welcome example, with the separately requested one-time empty-inbox backfill. Future notification producers should use INSERT ... RETURNING and treat an empty result as intentionally suppressed.

Welcome emails and workspace invitation emails call `lib/email/preferences.mjs` immediately before each Resend attempt. Its narrow server-only `email_notifications_allowed` RPC returns only a boolean; it does not expose Auth records or preferences to clients. Existing recipient email matching is normalized. Unknown invitation recipients have no saved preference and may receive an invitation; welcome additionally checks the known user ID so deleted users cannot pass. Missing configuration, failed lookup, or unexpected responses stop delivery. An opt-out stops retries; a previously lost invitation response remains unknown because it may already have been accepted. Preferences cannot retract an in-flight send or delivered email.

Suppressed invitations remain pending and show Not sent, with a distinct private suppressed send status. Re-enabling email does not send them automatically; a manager may resend under the existing cooldown/limits. Do not display another user's preference values or account existence in the inviter's UI. All future application email notification senders must use this shared check before each attempt. Verification and password-reset messages remain essential account-access mail and are sent by the signed Auth hook regardless of notification preferences. Stripe's own provider-managed emails remain controlled by Stripe configuration.

Kickstart verifies preference RLS/grants, both active triggers, the service-only email lookup and account backfill. `npm run test:hosted` includes `notification-preferences.sql`; `RUN_HOSTED_NOTIFICATIONS=true npm run test:ui -- notification-preferences.live.spec.ts` verifies switches, persistence, cross-workspace account scope, real hosted suppression, mobile/dark mode and failed-save recovery without sending an email. Unit tests cover lookup outages, retry-time opt-out and uncertain responses.

## Storage and access

`public.notifications` contains `id`, `user_id`, `kind`, `title`, `body`, `created_at`, and nullable `read_at`. It references `auth.users` with deletion cascade. Composite inbox and partial unread indexes support account-filtered queries. Titles and bodies have database length bounds; rendering uses escaped plain text.

RLS requires both the recipient's `auth.uid()` and the existing live verified-user check. Authenticated users have SELECT and UPDATE on `read_at` only. They cannot insert messages, delete messages, change recipients/content, or invoke the private welcome/bootstrap functions. Workspace owners and admins cannot read teammates' inboxes. The ordinary application uses the existing user-scoped Supabase client; no elevated runtime credentials were added.

The private signup trigger inserts the welcome message without replacing workspace bootstrap or ownership/deletion triggers. A partial unique index enforces one `welcome` message per user. Trusted backend operations may insert other messages; do not expose a generic client create-notification endpoint. Future workspace-specific messages need an explicit membership/retention policy before including tenant-confidential content in this account inbox.

## Kickstart and customization

`20260914130000_account_notifications.sql` is a core migration, installed regardless of billing/AI enablement. It creates the table, grants, RLS, indexes, private functions, and signup trigger, then backfills empty existing inboxes. The private helper uses `ON CONFLICT DO NOTHING`; Kickstart's transactional checksum ledger prevents reapplying installed migrations. Retries preserve read status and buyer content.

`scripts/kickstart/notifications.mjs` verifies storage privileges, RLS/policy presence, the active trigger, restricted helper execution, welcome uniqueness, and backfill. The usual all-provider read-only preflight still finishes before provisioning. Use this repository's Management API runner, not CLI migration history. No new environment variables or services are required.

For buyer customization after installation, add a new SQL migration replacing `private.welcome_notification(uuid)` with the desired welcome title/body. Do not edit a released migration or rewrite existing notifications unintentionally. Notifications are core functionality and remain installed when the AI example is removed.

The header receives an initial server summary and refreshes on popover open, window focus/visibility, and every 60 seconds while visible. It shares read updates with the inbox, ignores stale responses, and refreshes from Supabase after successful changes. The summary endpoint is authenticated and `private, no-store`. The paginated page uses fresh server reads; browser reload/navigation refreshes its message list. This feature does not require a Realtime subscription.

## Verification

- `npm run test:hosted` includes rolled-back notification checks for ordinary/invited signup, welcome deduplication, isolation even between teammates, forbidden inserts/content/recipient changes, unverified/stale-session denial, read-all beyond a page, retry stability, and account deletion cascades.
- `RUN_HOSTED_NOTIFICATIONS=true npx playwright test tests/e2e/notifications.live.spec.ts` opts into real hosted signup, browser login, keyboard popover use, message navigation, reload persistence, pagination, mark-all across pages, account isolation, dark/mobile rendering, retry/empty states, and focus refresh. On PowerShell set `$env:RUN_HOSTED_NOTIFICATIONS='true'` first. The fixture requires the explicitly configured hosted test target and verification off, disables credential-bearing traces, and deletes only its disposable accounts.
- Local installer tests verify notification checks reject incomplete installations and participate in the existing failure/retry workflow.

Verify installation and hosted/browser behavior on your own dedicated test target. Record fresh-installation and provider acceptance in PLAN.md.
