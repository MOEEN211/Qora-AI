# Three-credential kickstart

For a new local installation, copy `.env.example` to `.env` and enter only:

```dotenv
SUPABASE_ACCESS_TOKEN=
RESEND_API_KEY=
STRIPE_TEST_SECRET_KEY=
```

Run `npm run kickstart:check` for read-only checks, then `npm run kickstart`. Restart `npm run dev` afterward. The default app name is Forma and its local URL is `http://localhost:3000`; both can be customized. Billing is enabled by the supplied seed configuration. AI requires an optional OpenRouter key and is disabled by default.

## What you supply

- **Supabase:** a personal management access token from https://supabase.com/dashboard/account/tokens. It needs organization/project read access, project creation, API-key read/reveal/create, database/Auth configuration read/write, functions deployment and secrets read/write. An existing Supabase account and organization are required. Account quotas and the organization's billing plan still apply.
- **Resend:** a Full access API key from https://resend.com/api-keys. A sending-only key cannot publish templates or inspect domains.
- **Stripe:** your sandbox/test Secret key (`sk_test_...`) in `STRIPE_TEST_SECRET_KEY`. Restricted test keys (`rk_test_...`) work with the permissions in [BILLING.md](BILLING.md). Live keys are rejected for local bootstrap.

## What kickstart fills

| Provider | Automatic setup |
| --- | --- |
| Supabase | Creates a hosted project, obtains its reference/URL and publishable/secret keys, then installs versioned schema, permissions, Auth, storage, functions and the signed email hook |
| Resend | Selects a sender and test-mode setting, publishes all five email templates and saves their IDs |
| Stripe | Creates/reuses the sandbox catalog, prices, portal, webhook and hosted billing/reconciliation infrastructure |

The Supabase token is setup-only. Generated server keys stay private; only the URL and publishable key enter browser code. Project creation needs a database password: kickstart generates it and stores it in ignored `.secrets/supabase-bootstrap.json` for recovery. Migrations continue to use the Management API, without a direct database connection or local Supabase.

## Automatic choices and optional overrides

- **Organization:** uses the sole accessible Supabase organization. With several, the terminal asks you to select one. Set `SUPABASE_ORGANIZATION_SLUG` for unattended selection. Kickstart does not guess among organizations or create a new organization.
- **Region:** US East (`us-east-1`) by default. If it has no capacity, selects another available US region. It stops if no US region is available. Set `SUPABASE_REGION` to an available specific region to override this. Supabase chooses the smallest available instance size; no plan upgrade is requested.
- **Project name:** derived from `APP_NAME`, with a random suffix saved before creation to identify this installation on retries.
- **Sender:** uses `noreply@<verified-domain>`. Multiple verified sending domains trigger a terminal choice; set `RESEND_FROM_EMAIL` to choose a sender explicitly. With none, local setup uses `onboarding@resend.dev` and saves `RESEND_TEST_MODE=true`. That sender delivers only to your Resend account email. Use that exact email for signup/recovery testing. Domain verification and DNS remain manual prerequisites for sending to other users.
- **Email mode:** leave `RESEND_TEST_MODE` blank for discovery. Explicit `false` requires a verified domain; explicit `true` uses the restricted test sender. Existing sender/mode values are preserved.
- **Existing project:** keep `SUPABASE_PROJECT_REF` and generated values. Missing URL/API-key values can be read from that explicitly selected project; existing keys are not rotated. An unmanaged project must be empty to pass the normal installer checks.

`CONTACT_TO_EMAIL` is an optional inbox for the public contact form, not an auth-email requirement. Google OAuth still requires a Google OAuth app configured in hosted Supabase. GitHub/Vercel deployment is a separate step requiring their tokens and Stripe live setup; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Preflight and writes

1. Validate inputs and complete Supabase account/organization/project listing, Resend domain/template access, Stripe sandbox read access and enabled AI checks. No provider resources are created before these pass.
2. For a project that does not exist yet, `--check` reports that SQL, Auth, API-key, extension and function checks are deferred. It creates no files or resources. Read access cannot conclusively prove project/key creation or other write permissions.
3. A provisioning run records the operation and creates the hosted project. It waits for healthy status, retrieves or creates the publishable/secret API keys, then runs the existing full project-level and billing preflight before installing application resources or saving discovered `.env` values.
4. If those later checks fail, the new project is preserved. Fix the error and rerun; no reset or replacement project is attempted. Read-only discovery of an existing project never creates API keys; if it lacks a modern key, create that key in its dashboard first.

## Retries and recovery

Keep `.kickstart/bootstrap.json`, the project-specific `.kickstart/` receipts, `.secrets/` and generated `.env` values. The bootstrap receipt binds the operation to the Supabase organization/project, Stripe test account and a Resend-key fingerprint. Before initial setup finishes, a changed Resend key stops recovery because the API does not establish an unambiguous account identity for an empty account. Restore the original key while completing recovery. Ordinary installed-project reruns use existing provider resource checks and permit credential rotation in the same account.

A lost project-creation response is reconciled by the exact saved random project name and organization. If the result is still ambiguous, kickstart stops rather than sending another create request. A missing/inaccessible saved project is never replaced. API-key creation is similarly recorded first and reconciled by reading existing typed keys.

Definitive HTTP 400/401/403/422/429 rejections permit a retry after fixing the stated problem. Network failures and server errors leave a pending operation. If a pending project never appears, verify in the Supabase dashboard/support that the original request did not create a project before manually changing `pending` to `false` in the bootstrap receipt. For a pending key, confirm that no matching typed key exists before clearing only that key's entry in `pendingKeys`. Do not delete receipts to force a retry or reset a shared database. A provider response lost after project creation may require waiting for project listing visibility.

## Verification boundary

Local tests exercise account preflight gating, US selection, sender discovery, lost project/key responses, blocked replacements and actual CLI handoff to schema/email installation with fake providers. These tests do not prove real new-project provisioning, inbox delivery or successful subscription payments. Real fresh-project and separate-buyer acceptance remain required before release. Existing target verification is read-only unless an explicit installation run is requested.

Provider references checked: [project creation](https://supabase.com/docs/reference/api/v1-create-a-project), [available regions](https://supabase.com/docs/reference/api/v1-get-available-regions), [API keys](https://supabase.com/docs/guides/integrations/supabase-for-platforms#recommended-api-keys), [Resend sender addresses](https://resend.com/docs/knowledge-base/how-do-I-create-an-email-address-or-sender-in-resend), [Resend test restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
