# Verification and launch plan

This file belongs to your installation. Passing source checks does not certify provider setup or a production launch. Record your actual checks, date, environment and remaining limitations below; never record credentials or customer data.

## Included release boundary

The starter has local setup/failure tests, hosted isolation tests and opt-in browser suites. The reference installation has prior hosted and browser evidence, but real fresh-project installation on a separate buyer account, complete payment/webhook lifecycle, public-recipient email, Google, deployed Claude and AI failure/removal acceptance remain release gaps. Do not infer they passed on your accounts.

The repository preparation checks are recorded in CHANGELOG.md. They do not provision a fresh hosted project. The included CI example checks install, lint, local tests, build and TypeScript without provider secrets when activated in your repository. Hosted checks are deliberately opt-in.

## Installation acceptance

- [ ] Install dependencies from the lockfile on a clean copy.
- [ ] Missing/rejected credentials fail before provisioning; read-only preflight clearly identifies deferred checks.
- [ ] Install on your explicitly authorized hosted development/test project.
- [ ] Rerun safely without duplicate resources; recover an interrupted install without deleting receipts.
- [ ] Ordinary signup creates one workspace; invited signup joins only its intended workspace.
- [ ] Complete/skip onboarding; verify login/logout, session refresh, recovery, actual inbox delivery and verification-on signup if enabled.
- [ ] Test workspace role changes, invitations, ownership transfer and cross-workspace read/write denial.

## Paid feature acceptance

- [ ] Purchase monthly/yearly test subscriptions on two workspaces; verify independent entitlements and owner/admin/member permissions.
- [ ] Change plan, cancel/resume and simulate payment failure; inspect Stripe-originated webhooks, duplicate/reordered events and scheduled reconciliation.
- [ ] Confirm billing protections for pending/active subscriptions during workspace/account deletion.
- [ ] Verify admin accounting synchronization; incomplete/stale fields and insufficient history must stay explicitly incomplete.
- [ ] If enabled, verify Google consent and deployed MCP connection against the real configured origin.
- [ ] If enabled, verify AI streaming, history, concurrent credit spending, timeout/Stop/Retry and core flows after removal.

## Production launch

- [ ] Configure your verified email domain, real recipient delivery and contact inbox.
- [ ] Deploy using your GitHub/Vercel accounts; verify authenticated behavior and live payment synchronization.
- [ ] Verify ingress rate limits, error monitoring and access-log redaction for credential-bearing routes.
- [ ] Replace example product copy, testimonials, brand assets, legal text and contact details.
- [ ] Check desktop/mobile UI, noindex/preview guards and intended public metadata before enabling indexing.
- [ ] Back up private setup state and establish provider/data recovery procedures.

## Your verification record

Add dated results and unresolved failures here. Use dedicated hosted test projects with explicit target guards; never reset a shared or production database.
