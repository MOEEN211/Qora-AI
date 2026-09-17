# Workspace subscriptions

## Confirmed scope

Each workspace has its own separately paid Stripe subscription. Users may create unlimited workspaces; paying for one does not pay for another. All members of a paid workspace share its product entitlement. Owners/admins manage its subscription; members cannot view the payment portal or financial details. Changing workspace selects that workspace's billing. Stale browser tabs cannot start billing for a newly selected workspace silently.

There are no seat limits, usage billing, top-ups or workspace-count caps. The optional AI module grants each workspace 100 credits once, independently of billing; see AI.md. Existing creation/invitation rate limits are abuse protections, not subscription limits. Billing does not change the organization data model or ordinary/invited signup behavior.

Initial editable test catalog:

| Plan | Monthly USD | Yearly USD |
| --- | ---: | ---: |
| Starter | 19 | 190 |
| Pro | 49 | 490 |
| Growth | 99 | 990 |

`config/billing-seed.json` is used only to seed missing products/prices during initial setup. After initialization, the Stripe test catalog is the authoring source. Change names/descriptions there. To change an amount, create a replacement recurring price and archive the superseded price. Keep exactly one active flat monthly and one active flat yearly price per plan, with one currency across the catalog. Ambiguous prices stop setup. Leave `forma_catalog` and `forma_plan` metadata intact; these provide stable identities even when names change.

All three tiers contain the same starter infrastructure. The optional AI example gives each workspace 100 initial credits. Billing events do not grant or renew AI credits. Buyers add their product's differences. `requireSubscription()` checks the selected workspace on the server; it can be attached to the buyer's paid product routes. Auth, settings, memberships and the starter dashboard remain accessible without a subscription so users can manage billing and their data.

## Billing tab

The dashboard header displays a compact workspace plan tag beside the notification bell for every member. It reads the existing user-scoped `workspace_subscription` summary and resolves paid plan names from the shared catalog. `Free` means no current paid entitlement; it does not create a free Stripe subscription. Lookup failures display `Plan unavailable`, and an unavailable catalog falls back to `Paid` for a confirmed paid entitlement. Workspace switching and billing status refresh update the header.

Settings > Billing displays Starter, Pro and Growth before Stripe setup, using the same config/billing-seed.json values that initialize the catalog. The monthly/yearly switch shows the full charge and derives annual savings from the selected prices. Once a hosted catalog is available, its names and prices take precedence. Display-only seed prices have empty provider IDs and cannot start Checkout.

The page includes the workspace's current plan/status and period end, plan selection, and a Manage subscription button for payment methods, invoices and cancellation through Stripe Customer Portal. The redundant Billing details section is omitted. Unconnected controls are disabled with clear empty states; no payment details or invoices are fabricated. Existing subscribers change plans through the authenticated portal action. Owners/admins can manage billing; members see only the permission message. Switching workspaces resets local billing selection/feedback. Development-only /preview/billing exercises the same empty-catalog path; state=active, state=canceling and state=member preview presentation without enabling payments.

## Subscription policies

- No trial or free subscription is created. A workspace starts unsubscribed.
- Checkout purchases exactly one recurring price with quantity one. Existing subscriptions are changed through Customer Portal, not a second Checkout.
- Upgrades apply immediately with Stripe's prorated invoice and confirmation. Decreases in amount or shorter intervals are scheduled for period end through portal configuration.
- Cancellation takes effect at period end. The subscription remains active until then; the portal supports managing scheduled cancellation.
- `active` and `trialing` grant paid entitlement for recognized single-item plans. `past_due`, `unpaid`, `paused`, `incomplete`, `incomplete_expired`, canceled or unknown subscriptions do not. No application grace period is added. Stripe's configured collection/retry policy remains in effect.
- The webhook, scheduled reconciliation or Refresh status updates the application. A Checkout return URL never grants access by itself.
- A workspace with a pending Checkout or any nonterminal subscription cannot be deleted. Cancel first and wait until the paid period ends, then refresh billing and delete. Account deletion checks workspaces it would delete; transferred/shared workspaces and their billing are preserved.
- Stripe retains financial records. Local durable customer/event records survive workspace deletion without the organization link. A final business/audit retention policy remains a release decision; no broad financial-data purge is implemented.

## Credentials and test kickstart

Fill these privately in root `.env`:

```dotenv
STRIPE_TEST_SECRET_KEY=
```

Use the Stripe **Secret key**, beginning with `sk_test_` for test or `sk_live_` for live. One key per mode handles kickstart and runtime billing. No **Publishable key** (`pk_`) is required because payment and portal screens are hosted by Stripe. A restricted key (`rk_`) also works when it has all the permissions below.

The key needs account read; product, price, webhook endpoint and Customer Portal configuration read/write; customer read/write including search; subscription and invoice read; Checkout Session read/write; and Customer Portal session creation. Stripe's dashboard groups some permissions differently: actual read probes and subsequent operation errors are authoritative. Read-only preflight cannot prove write-only Checkout/portal permissions. The selected mode's secret key is server-only and is supplied to Next.js and the billing Edge Function; it is never exposed to the browser.

```sh
npm run kickstart:check
npm run kickstart
```

Normal kickstart reads/writes test Stripe only, even if live keys are present. Every required Supabase, Resend and enabled Stripe preflight completes before any provisioning write. Missing keys stop setup. Set `enabled: false` in `config/billing-seed.json` to run auth/team setup without installing billing.

It creates/reuses three Products, six Prices, a portal configuration and a signed webhook endpoint; installs the versioned billing migration; projects the catalog into private Postgres storage; deploys a hosted Edge Function; and schedules reconciliation using hosted pg_cron/pg_net and Vault. The Stripe section in `.env` contains only secret API keys (`STRIPE_TEST_SECRET_KEY`, `STRIPE_LIVE_SECRET_KEY`), webhook signing secrets and the three product IDs (`STRIPE_<MODE>_PRODUCT_ID_<PLAN>`) for each mode. Kickstart writes only product IDs and webhook secrets there, preserving existing credentials. Price IDs and amounts are synchronized into the hosted private catalog; account and portal configuration are read from that catalog at runtime. Endpoint IDs, catalog identity and reconciliation credentials are managed in ignored private setup state under `.secrets/<test-project-ref>-stripe-setup.json`. Keep this file private and retain it alongside `.kickstart/` receipts. Older generated environment fields are migrated there on the next provisioning run. API credentials are supplied by the buyer; kickstart does not create API keys.

The Edge Function receives only the active mode's Stripe secret key, webhook secret, account ID, reconciliation secret and a narrowly used Supabase server key. The Supabase management token and opposite-mode Stripe key are never copied. The reconciliation token is stored in Vault, not in cron command text.

## Live deployment kickstart

Configure `STRIPE_LIVE_SECRET_KEY` and the two GitHub/Vercel tokens. Kickstart discovers and saves `APP_URL_LIVE`; supply it manually only for a custom domain. Development and production use the same configured hosted Supabase project, email hook secret and Resend template IDs. There are no separate Supabase or Resend live fields. Stripe live activation and a verified production email sender are prerequisites. No Stripe mode variable is needed. When both secret keys are present locally, the app uses test mode. Production receives only the live secret key; deployment kickstart disables preview deployments and does not install preview secrets. A local production build does not switch billing to live.

```sh
npm run kickstart:deploy -- --check
npm run kickstart:deploy
```

This command now includes GitHub repository preparation and a Git-linked Vercel production deployment; fill the deployment fields documented in DEPLOYMENT.md. It first reads the current, owned test catalog and validates the live target and all required services, including GitHub/Vercel. After repository/project/domain preparation, it copies supported product details and the six selected recurring prices into live mode, creates the live portal and webhook, and installs the live billing function/catalog alongside test billing on the shared hosted project. Supabase credentials and Resend template IDs are reused without remapping; Stripe test/live resources and receipts remain separate. Auth settings and the hosted email hook are shared. The production-origin transition is recorded so ordinary kickstart cannot silently restore localhost. It never copies test customers, subscriptions, payments or payment methods. Disabling billing in config/billing-seed.json also disables live Stripe provisioning.

Live Products/Prices have separate IDs. New amounts create new live Prices; existing subscribers keep their old price until explicitly changed. There is no automatic migration of existing subscriptions. Live edits outside the last recorded product configuration stop promotion for reconciliation rather than being overwritten. Retain `.kickstart/` receipts, private `.secrets/` setup state and generated `.env` values.

Billing/email subset of the Vercel runtime-only mapping (the complete executable allowlist, including AI/contact/SEO, is `scripts/kickstart/deploy-config.mjs`; initial previews are disabled):

| Runtime variable | Root `.env` source |
| --- | --- |
| `APP_URL` | `APP_URL_LIVE` |
| `APP_NAME` | `APP_NAME` |
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| `SUPABASE_SECRET_KEY` | `SUPABASE_SECRET_KEY` |
| `STRIPE_LIVE_SECRET_KEY` | same named value |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | production sending credentials/address |
| `RESEND_TEMPLATE_WELCOME_ID` | `RESEND_TEMPLATE_WELCOME_ID` |
| `RESEND_TEMPLATE_WORKSPACE_INVITATION_ID` | `RESEND_TEMPLATE_WORKSPACE_INVITATION_ID` |

Set server secrets as sensitive environment variables. Never bulk-upload `.env`. Stripe Tax is not enabled automatically; buyers must configure registrations and their chosen tax policy before enabling automatic collection. Stripe billing notices/receipts/dunning emails are configured in Stripe; this slice does not duplicate them through Resend.

## State, retries and security

`private.billing_accounts` maps `(workspace, mode)` to a Stripe account/customer independently of `private.billing_subscriptions`. Both are inaccessible to ordinary database roles. User-scoped RPCs expose billing to owners/admins and a limited entitlement summary to members. Setup owns `private.billing_catalog`; no client can change plans, paid status, customer IDs or events.

Privileged operations use only the service-role RPC protocol. Workspace membership is checked again when claiming interactive operations. An expiring, token-fenced database lease serializes Checkout, refresh, webhooks and deletion. A durable Checkout attempt holds a single choice/expiry across competing requests; retries reuse identical Stripe parameters. The initial customer's email is captured once for idempotency. A lost customer response is recovered through owned metadata search; if ambiguous or beyond Stripe's guaranteed idempotency window without a recoverable customer, setup stops for operator reconciliation instead of creating duplicates.

Signed raw webhook bodies are size-limited and timestamp-verified; wrong-mode and Connect events are rejected. The handler resolves the customer through the durable mapping, obtains a lease, fetches current Stripe subscription state, and atomically commits the snapshot and event completion. Duplicate and old events cannot regress state. An unrelated Stripe customer is ignored. Failed work returns 503 for retry. Reconciliation processes the least recently attempted 20 mapped customers every five minutes and repairs missing caches. Larger installations should monitor backlog/cron responses and adjust capacity.

Provider creation uses ownership metadata, deterministic IDs or idempotency keys and state discovery. Partial test-product creation can resume. A webhook creation response contains a one-time signing secret: if that response or local save is lost, setup stops and asks the operator to restore the secret from Stripe Workbench. It does not create another webhook. No cross-provider rollback or destructive database reset is attempted.

## Acceptance checks

### Operator reporting

The admin panel reads curated subscription fields and an additive `reporting` snapshot projection from `lib/billing/engine.mjs`. Actual recurring prices and expanded recurring discounts feed monthly-normalized MRR; unsupported shapes remain unknown. This projection does not change paid-access decisions. A private trigger records normalized states and synchronization coverage within the existing fenced commit. Financial observations retain durable billing-account IDs after workspace deletion, without copied customer names/emails.

For an existing installation, update accounting workers explicitly with `npm run kickstart:admin:billing -- --check`, then `npm run kickstart:admin:billing`. This can update owned catalog/worker/webhook/schedule resources and is never triggered by report reads. Missing accounting fields remain Incomplete MRR until synchronized. Verify actual payment/discount events and sufficient history on your installation.

Local tests cover creation, interrupted price creation, catalog edits, reruns, live copying, mode/credential rejection, webhook signatures, subscription status, cache recovery and concurrent Checkout request reuse. `/preview/billing` is a development-only render of the actual Billing component with sample plans and payments disabled.

End-to-end acceptance for your installation: verify owner/admin/member permissions and distinct subscriptions across two workspaces; purchase monthly and annual plans using Stripe test payments; change plans, cancel, resume and test payment failure; confirm actual webhook deliveries/replays and scheduled reconciliation; test pending/active/canceled workspace and account deletion; rerun kickstart and inspect absence of duplicates. Do not claim payment acceptance before these checks pass.

Public references checked during implementation: [Products and prices](https://docs.stripe.com/products-prices/manage-prices), [webhook signatures and delivery](https://docs.stripe.com/webhooks), [portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create), [hosted scheduling](https://supabase.com/docs/guides/functions/schedule-functions). Stripe SDK 22.6.2 and its API version 2026-08-26.dahlia are pinned.
