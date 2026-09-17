# Application sign-in

Supabase Auth handles password signup/login, Google OAuth, and passwordless email. Next.js uses the existing publishable-key SSR client and verified server-side sessions. No Google client ID or client secret belongs in `.env`, Next.js, Vercel, or the email hook.

## Google

Create a Google OAuth **Web application** and configure its consent audience. Add the hosted Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback` as the authorized Google redirect URI. Add the app origins to the Google client where required. Put the client ID and secret **only** in the selected hosted Supabase project's Authentication → Sign In / Providers → Google settings, and enable that provider.

The login/signup pages always show a clickable Google button without an unavailable note, as requested by the owner. It is disabled only while a form submission is pending. The Server Action checks Supabase's public Auth settings when clicked and returns an actionable error if Google is not configured. The shared OAuth consent sign-in form follows the same behavior. Kickstart reports availability and manages the application's `/auth/callback` redirect allowlist; it never sets, disables, persists, or deploys Google credentials. Provider enablement does not prove Google consent/audience/redirect configuration; verify an actual Google login after configuring it.

Google starts in a same-origin Server Action. Supabase handles OAuth state, Google tokens, and the PKCE code challenge. The app's callback exchanges the authorization code using the initiating browser's verifier cookie, then uses the existing verified session/workspace rules. A canceled or failed callback returns a safe retry message. Arbitrary `next` destinations are ignored. Provider tokens are not stored by the app. Ordinary first Google signup uses the existing atomic personal-workspace bootstrap.

An active workspace invitation requires email/password or magic link. Google cannot forward the validated invitation credential into Supabase's user-insertion trigger; the server therefore rejects starting Google in that context instead of silently creating an extra personal workspace. Once the invited account exists, Google can sign in through Supabase's normal identity-linking behavior when the verified email matches. Do not bypass Supabase's identity checks or infer authorization from Google metadata.

## Magic links

Choose **Magic link** on `/signup` or `/login`. Signup collects full name/email and permits Supabase to create the account. Login sets `shouldCreateUser: false`; unknown addresses receive a generic response and do not create accounts. Neither form needs a password. Provider failures and throttling remain visible rather than claiming an email was sent.

Supabase issues, expires, and verifies one-use tokens. The signed Send Email Hook handles `magiclink` events and passwordless first-signup `signup` events. It uses the new `emails/magic-link.html` Resend template. Every action URL is built from active `APP_URL`; a same-origin `flow=magic` hint selects presentation only. Untrusted redirects never select a destination. Email notifications opt-out does not suppress authentication links.

The email opens `/auth/confirm`; a GET never consumes the token. Pressing **Sign in and continue** verifies it in a Server Action and sets the SSR session. Reused/expired links have a retry path. Valid invited signup passes the invitation credential through signup metadata; the existing database trigger validates email, expiry, token and stored role, then creates only the invited membership. Confirmation can resume that membership on another browser. Existing members retain their other workspaces.

MCP consent initiated in the same browser can resume through a bounded, HTTP-only continuation cookie. This never grants consent automatically. Opening an email on another browser cannot resume that cookie; restart the connection request there.

## Installation and checks

Run `npm run kickstart`. All required read-only provider checks still precede writes. Setup publishes/reuses the fifth source template, saves `RESEND_TEMPLATE_MAGIC_LINK_ID`, installs only its scoped `FORMA_RESEND_TEMPLATE_MAGIC_LINK_ID` email-function secret, and deploys the signed hook. Existing template IDs, migrations and billing guards are preserved. Function receipts retain verified bundle checksums: Supabase secret updates may increment versions, but a version increase is accepted only when the bundle checksum, slug, active status and JWT setting match. Actual bundle drift still stops preflight. Preview the new email at `/preview/emails?template=magic-link` in development.

Resend test mode only delivers to the exact Resend account email. Other recipients require a verified sender domain. Delivery acceptance must be tested separately from configuration and generated-token tests. Google users do not need Resend to sign in. Passwordless users can set a password using the existing email recovery flow before password-confirmed changes or deletion; these security guards are retained.

Next.js development logging excludes token-bearing confirmation/callback URLs and Server Action arguments. Do not enable full request/action logging for authentication or collect traces/screenshots containing credentials. Deployment access-log handling must likewise avoid credential query strings.

Tests: `npm test`; `npm run test:ui -- auth-methods.spec.ts ui.spec.ts`; with `RUN_HOSTED_AUTH=true` and the existing explicit `HOSTED_TEST_PROJECT_REF`, `npm run test:ui -- auth-methods.live.spec.ts`. Hosted tests use disposable users and real Supabase-generated tokens, suppress optional fixture welcome emails, check scanner/replay/session/workspace behavior and clean up their own users. They also exercise the real login request and test-sender rejection with non-deliverable fixture addresses; successful inbox delivery and real Google consent remain separate checks.

Provider references: [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google), [passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook), [Resend templates](https://resend.com/docs/api-reference/templates/create-template).

## Public session navigation — 2026-09-14

Authenticated visits to `/login` or `/signup` redirect on the server to `/dashboard` before rendering the form. The dashboard's existing confirmation guard still applies. These read-only redirects do not consume invitation or OAuth continuation cookies; acceptance, confirmation, recovery, and switch-account actions retain their existing flows. All AuthShell logos link to `/`.

Marketing and documentation navigation show a profile-photo/user-icon dropdown for a server-validated signed-in account, offering Dashboard, Settings, and Sign out. Guests see Sign in. The public header uses a request-memoized `getUser()` lookup, reads only the current user's display profile through the user-scoped client, and serializes only name, email, and a signed avatar URL. It does not fetch workspace membership or grant access. Proxy refresh covers the HTML routes displaying this session-specific header, with private/no-store responses; Next dev overrides Cache-Control to no-cache/must-revalidate. Public Markdown exports stay session-independent. See the [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs).

Docs search loads on first use (`preload: false`) to prevent its deferred hydration from racing with Base UI account-menu page markers. The account menu is nonmodal. Keyboard search, results, and Escape dismissal remain available; both the signed-in header test and a mobile search check pass without hydration warnings.
