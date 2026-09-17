# Customer feedback

The sidebar account menu contains Settings, Feature request, Bug report, and Sign out, on desktop and mobile. Sign out is no longer in the header. The feature dialog shows requested features on the left and the submission form on the right immediately; mobile stacks the form below the list. Successful submission clears the form and refreshes the list in the same dialog. Both feedback forms use the installed shadcn/Base UI design tokens and require a signed-in, confirmed account.

Feature requests are deliberately shared across all signed-in customers of the buyer's app. Search matches literal, case-insensitive text in titles and descriptions. Results are paginated in groups of 20, newest first. Customers can submit requests and add or remove their own upvote. Each user gets one vote per request, regardless of workspace. The board exposes no author, workspace, or voter identities. Bug reports never appear on it.

## Storage and permissions

Kickstart automatically discovers `supabase/migrations/20260914013000_customer_feedback.sql`, installs it through the existing checksum ledger after all required preflight checks pass, and verifies the tables and RPC permissions. No extra environment variables, local Supabase, CLI migration history, or seller service are required.

- `private.bug_reports`: report title, reproduction details, submitting Auth user, active workspace, and creation time.
- `private.feature_requests`: shared request title/details, private authorship/workspace attribution, and creation time.
- `private.feature_votes`: request, Auth user, and vote time; a composite primary key prevents duplicate votes.

All three tables have RLS enabled and deny direct access to anonymous and authenticated roles. Database operators can inspect them through the hosted Supabase SQL Editor, selecting the `private` schema. No operator administration UI is added by this slice. Never expose raw tables to customers to build the board.

The public `submit_feedback`, `search_feature_requests`, and `set_feature_vote` functions are SECURITY INVOKER wrappers around narrowly scoped private SECURITY DEFINER functions with an empty search path. Both layers revoke public/anonymous execution. The private functions verify the current Auth user on every call. Submission additionally verifies membership of the active workspace; identities and timestamps are assigned in the database. Ordinary application calls use the signed-in user's Supabase client, never elevated credentials.

Titles accept 3–120 characters; details accept 10–5,000. The database serializes submissions per user and limits each type to 10 per hour. A form retains its submission UUID through retries, so an uncertain response can be retried without duplication while the form remains open. Closing and reopening creates a new submission. Vote operations set an explicit desired state and are safe to repeat; database row locks serialize concurrent votes and return the resulting count.

Account deletion removes that user's reports, authored requests, and votes. Workspace deletion removes feedback attributed to that workspace; deleting a request also deletes its votes. This matches the existing deletion promise to remove the deleted user's/workspace's data. Shared requests are not retained after their author or originating workspace is deleted.

## Verification

- `npm run test:hosted`: transaction-rolled-back checks for shared search, identity/report privacy, tenant attribution, anonymous/unverified/deleted-user denial, retry behavior, input bounds, hourly limits, and deletion cascades.
- Set `RUN_HOSTED_FEEDBACK=true`, then run `npm run test:ui -- feedback.live.spec.ts`: creates two disposable confirmed accounts only on the explicitly configured dedicated target, exercises actual forms, cross-customer visibility/voting, reload persistence, mobile/keyboard behavior, Settings navigation, and sign out; deletes both fixtures afterward. Credentials are not captured in traces/screenshots.
- `npm test`: installer preflight, partial-failure, and rerun checks. Mocked provider checks do not replace hosted acceptance.

Search is a bounded substring query without a dedicated text index; add indexed search when the board's size requires it. Submission quotas are database-enforced; infrastructure traffic limits and moderation tooling remain future product decisions.
