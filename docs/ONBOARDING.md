# Account onboarding

Every confirmed account sees `/onboarding` until it completes the three questions or selects **Skip for now** once. Existing accounts are included through a migration backfill. Invited users keep their invited workspace; onboarding never creates or renames organizations.

## Questions and navigation

1. **What should we call you?** Text input prefilled from the profile saved at signup.
2. **What will you use [Product] for?** One choice: Personal projects, Work, or Just exploring.
3. **What would you like to try first?** Multiple choices: Explore the dashboard, Try AI chat, Invite teammates, Connect an integration. Selecting none is valid. The AI choice is hidden when AI is disabled.

Back and Continue save the visible answers and destination step before moving. Refresh or a new login resumes at the last saved step. Edits made without pressing a navigation button are not autosaved. Get started records completion; Skip for now saves partial answers and records a permanent skip, even with all questions unanswered. Both enter the dashboard. A failed save keeps the form visible with a retry message.

Answers demonstrate input patterns and capture interests. They do not provision integrations, send invitations, generate AI responses or change the account profile. Customize copy/options in `lib/onboarding.ts` and `components/onboarding/onboarding-form.tsx`; changing accepted stored values also requires a new migration. Removing AI requires no onboarding migration: the optional choice is already controlled by `AI_ENABLED`, and historical answers remain readable.

## Database and access

`public.onboarding` has one row per Auth user: `user_id`, `display_name`, `use_case`, `interests`, `current_step`, `status`, `created_at`, `updated_at`, `completed_at`, and `skipped_at`.

- A private insertion trigger creates the row in the Auth signup transaction, independently of workspace bootstrap. Untrusted signup metadata cannot mark onboarding completed or skipped.
- RLS permits only the confirmed account to read/update its answers, including when other users share its workspace. Anonymous and unverified requests cannot access answers.
- The server action derives the user ID from verified authentication. User-scoped Supabase clients perform ordinary reads and writes; no elevated runtime key is used.
- Grants exclude insert/delete, reassignment, and timestamp updates. An update trigger timestamps transitions and preserves terminal states and answers. A stale save or simultaneous finish/skip cannot undo the first persisted terminal choice.
- Auth deletion cascades to onboarding. Workspace changes do not restart onboarding.

Auth destinations and the dashboard layout consult database status. Signed-out visitors go to login and unconfirmed users to verification. Existing invitation acceptance runs first. A validated OAuth consent continuation passes through onboarding and is resumed after completion/skip; arbitrary external destinations are rejected. These are onboarding navigation rules, not new authorization rules for API keys, billing or memberships.

## Installation

Ordinary `npm run kickstart` discovers `20260915120000_account_onboarding.sql` automatically and verifies the table, grants, policies, signup/update triggers, private helpers and backfill. The checksum ledger makes retries safe; released migration files remain immutable.

For an existing managed installation with an active production origin, use:

```sh
npm run kickstart:onboarding -- --check
npm run kickstart:onboarding
```

This scoped installer checks the configured hosted project, saved receipt, publishable key and existing migration ledger before applying only onboarding. DDL permission cannot be proven by the read-only checks. It preserves Auth/email origins, provider resources and the existing receipt. No local Supabase, Docker or CLI migration history is used.

## Verification

`npm run test:hosted` includes transaction-rolled-back onboarding checks for signup defaults, metadata distrust, same-workspace account isolation, grants, validation, progress, terminal states, unverified access and deletion cleanup.

Set `RUN_HOSTED_ONBOARDING=true` and run `npm run test:ui -- onboarding.live.spec.ts onboarding-validation.spec.ts` against a running local app. Set `PLAYWRIGHT_BASE_URL` if it uses a port other than 3000. The hosted test requires the explicit `HOSTED_TEST_PROJECT_REF` guard and immediate signup, creates only disposable accounts and cleans them up. It covers back/forward, reload/login recovery, protected dashboard URLs, durable completion/skip, stale tabs, failed requests and responsive dark mode. Credentials are excluded from screenshots and traces are disabled.

Other opt-in hosted feature tests use `skipOnboardingIfShown` before asserting dashboard/consent content on their disposable accounts. Database/API-only tests are unaffected. Verification-on email signup, real Google/magic-link redirects and a separate buyer installation retain their existing acceptance requirements.
