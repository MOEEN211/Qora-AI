# Forma — Ship & Scale SaaS starter

Build your application with Next.js, hosted Supabase, Stripe and Vercel. Includes authentication, workspaces and invitations, subscription billing, settings, operator administration, notifications, feedback, public pages, product documentation and an optional removable AI chat example.

**Starter documentation:** [shipandscale.dev/docs](https://shipandscale.dev/docs). The included `/docs` website is an example for *your product’s* documentation. Repository guides below remain available offline.

## Get your copy

After receiving access, choose **Use this template → Create a new repository** on GitHub. Create a **private** repository under your own account and copy only the default branch. Clone your new repository. A template copy starts with its own history. Alternatively, extract the supplied source ZIP into a new directory.

Do not develop in or push changes to the seller’s repository. Never copy the seller’s environment, provider credentials or setup receipts. Your copy uses your own accounts.

## Start locally

Install Git and Node.js 24 LTS with npm. Create accounts with Supabase, Resend and Stripe before starting. Supabase remains hosted; Docker and a local database are not required.

```sh
npm ci
```

Copy `.env.example` to `.env` using your editor or file manager. Enter these three credentials:

```dotenv
SUPABASE_ACCESS_TOKEN=
RESEND_API_KEY=
STRIPE_TEST_SECRET_KEY=
```

Use a Supabase management token, a Resend **Full access** API key, and a Stripe **test** secret key. Leave generated project IDs, application keys and template IDs blank. See [credential permissions and recovery](docs/KICKSTART.md).

```sh
npm run kickstart:check
npm run kickstart
npm run dev
```

The first command performs read-only preflight. The second creates a hosted Supabase project in an available US region, installs the application, configures email and Stripe test resources, and saves generated settings locally. Provider quotas and charges apply. With multiple provider organizations or sending domains, select the intended one when prompted.

Open [localhost:3000](http://localhost:3000), sign up, and complete or skip onboarding to reach your workspace. Without a verified Resend domain, setup uses its account-only test sender: use the email address associated with your Resend account. Public recipient delivery requires your own verified domain. Google OAuth needs separate provider configuration; AI is off by default.

Keep `.env`, `.kickstart/` and `.secrets/` private and backed up. Fix a reported failure and rerun the same command with the same accounts; do not delete receipts or create replacement projects to bypass recovery guards. Hosted installation is separate from a successful dependency install or build.

## Customize

| Change | Start here |
| --- | --- |
| App name, active origin, optional AI | `.env.example` and your private `.env` |
| Public copy, branding and legal placeholders | `config/marketing.ts`, `config/legal.ts`, `app/globals.css` |
| Navigation and dashboard shell | `components/dashboard/app-shell.tsx` |
| Initial plans and prices | `config/billing-seed.json`; after setup, edit the owned Stripe test catalog |
| Onboarding questions | `lib/onboarding.ts` |
| Email templates | `emails/`, `scripts/kickstart/templates.mjs` |
| Your product documentation | `content/docs/` |
| Database changes | New files in `supabase/migrations/`; never edit installed migrations |

Preserve the included Base UI/Vega neutral design tokens unless deliberately rebranding. Read [architecture](docs/ARCHITECTURE.md), [coding instructions](AGENTS.md) and [feature guides](docs/PRD.md) before changing authentication, tenancy or billing.

## Deploy your application

Fill `GITHUB_TOKEN`, `VERCEL_TOKEN` and, with billing enabled, `STRIPE_LIVE_SECRET_KEY` in your private `.env`. Configure a verified production email sender and authorize Vercel’s GitHub App.

```sh
npm run kickstart:deploy -- --check
npm run kickstart:deploy
```

**Repository boundary:** deployment kickstart creates a new private GitHub repository and Vercel project for your application. It does not adopt your populated template-copy repository. An explicitly selected existing repository must be empty. After successful deployment, clone the newly created app repository for ongoing development; its `main` branch deploys through Vercel. Retain the original setup folder and private receipts for provider recovery. See [deployment setup and permissions](docs/DEPLOYMENT.md).

Local development and production share the configured hosted Supabase project. Deployment changes its active Auth/email/MCP origin to production; previews start disabled. A code rollback does not roll back those provider settings. Keep `SEO_INDEXABLE=false` until your public content and launch checks are complete.

## Verify your copy

```sh
npm run lint
npm test
npm run build
npm run typecheck
```

The build generates Next.js route types before the standalone typecheck. These checks require no provider credentials. A Linux CI example is included at `.github/verify.yml.example`; copy it to `.github/workflows/verify.yml` in your own repository using a GitHub account/token with workflow-write permission to activate it. It runs the same checks without provider secrets. These checks do not install hosted services or prove payment/email delivery.

Browser checks use `npm run test:ui` with a running local server and Chrome. Hosted checks require a deliberately selected **dedicated hosted test project** and matching `HOSTED_TEST_PROJECT_REF`; see [release and launch checks](docs/PLAN.md). Never run destructive tests or reset a production database.

## License and maintenance

This is commercially licensed software, not an open-source template. See [LICENSE.md](LICENSE.md): a licensed purchaser may build multiple commercial end products; redistribution or resale of the starter itself is prohibited. Third-party packages retain their own licenses. [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) identifies source dependencies.

You maintain your customized copy. No automatic upstream merge or ongoing update service is included. Review [CHANGELOG.md](CHANGELOG.md) and the documented acceptance limits before shipping your product.
