# Operator administration

The separate `/admin` area contains Overview, Users, Workspaces, Subscriptions, AI usage and Feedback. Customer information is read-only. Every operator has equal access and can add or remove other operators in **Admin account menu → Manage admins**. Workspace roles do not confer operator access.

## First admin

1. Complete kickstart and create a normal application account. The account must be confirmed under the application's configured signup policy.
2. From the project directory, run:

   ```sh
   npm run admin:grant -- --email owner@example.com
   ```

3. Sign in and open `/admin` (or **Admin** in the account menu). Your normal signed-in session opens the admin panel directly.

The command uses the existing `.env` hosted project, local Supabase management token and matching `.kickstart` receipt. It never creates an account or discovers a different project. Add `--check` for a read-only preview. Repeating a grant is a successful no-op. Setup credentials remain local.

Any admin can add an existing confirmed account in Manage admins. Share the displayed admin link manually; the operation sends no email. Each added admin uses the normal application login.

To remove access locally:

```sh
npm run admin:revoke -- --email teammate@example.com
```

The final admin cannot be revoked or delete their account. Add another admin first. This guard also handles simultaneous removals. Revoked users lose access on their next server request. The buyer's independent database ownership remains unchanged; supported commands use the protected operator table rather than an editable profile flag.

## Login and access

Admin uses the normal application login screen. There is no authenticator-app enrollment or code prompt. An already signed-in admin enters directly; logout ends access and a new visit requires normal login. Supabase's normal session validity and revocation apply.

Every admin operation checks current operator membership, the confirmed account and a current first-party session in the database. Customer profiles, workspace roles, workspace API keys and delegated OAuth/MCP tokens cannot grant operator access. Existing enrolled Supabase factors are not deleted by this change; they are no longer required by the admin panel.

## Existing installations

For an existing kickstart-managed project, run:

```sh
npm run kickstart:admin -- --check
npm run kickstart:admin
```

This checks the exact target, receipt, immutable migration checksums, dependencies and Auth configuration before installing additive admin migrations. It preserves accounts and grants. It does not provision Stripe or deploy billing workers. Normal fresh-install kickstart includes admin automatically.

Existing billing workers need the new accounting projection for complete MRR. The separate explicit upgrade is:

```sh
npm run kickstart:admin:billing -- --check
npm run kickstart:admin:billing
```

That command checks all installed billing modes first, then uses the existing retry-safe billing installer to update owned worker/webhook/catalog/schedule resources and matching local receipts. It preserves buyer-edited catalogs and fails on ownership/drift conflicts. It can change provider resources; admin report reads never run it. Existing incomplete accounting snapshots remain visibly incomplete until the upgrade and successful synchronization.

## Reports and privacy

- Activity starts with observed authenticated application use after installation. It accumulates without historical import or per-login reset. Authorized API/MCP workspace activity also counts; admin browsing and background jobs do not.
- Date filters use UTC, with 7/30/90-day periods. Customer tables show 25 rows per page; user/workspace/feedback/subscription lists use stable cursors. AI usage uses ordered offset pages because its aggregate counts can change.
- MRR uses actual recurring prices, recurring discounts and annual normalization. Different currencies remain separate. Unknown or stale records are incomplete. No recurring revenue is displayed as zero without inventing a currency.
- Churn is starting paid workspaces still canceled/unpaid at period end divided by starting paid workspaces. `past_due`, scheduled cancellation and new period acquisitions are excluded from losses; recovered workspaces are retained. Missing coverage shows Insufficient history. Check synchronization coverage and actual Stripe data before relying on these metrics.
- Users/workspaces expose approved identities, membership and onboarding details. Feedback includes full attributed reports/requests. AI usage exposes only accounting totals, never chat titles, prompts or responses. Missing provider cost remains unknown.
- Subscription details show the latest 100 recorded status changes and a Stripe customer link. Invoices, payments and refunds remain in Stripe.
- Signup counts retain no identity; workspace activity cascades on workspace deletion. Billing observations retain durable accounting IDs. Operator access changes retain actor/target IDs for 90 days, clearing those references when an account is deleted.

## Verification

Run `npm test`, `npm run test:hosted`, `npm run typecheck`, `npm run lint` and `npm run build`. With the existing local server running, set `RUN_HOSTED_ADMIN=true` and `PLAYWRIGHT_BASE_URL` to its origin, then run `npm run test:ui -- admin.live.spec.ts`. Hosted tests require the explicit configured test target, use disposable fixtures and remove/roll back them. Browser captures exclude credentials.

See [PLAN.md](PLAN.md) for actual acceptance results and remaining provider checks.
