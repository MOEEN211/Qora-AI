# Deployment kickstart

`npm run kickstart:deploy` prepares a private GitHub repository, creates a Git-linked Vercel project, provisions the existing live service configuration, and requests a production deployment. It runs on the buyer's computer with their credentials. There is no seller-operated service.

See [PLAN.md](PLAN.md) for installation-specific verification. A successful deployment does not establish payment or inbox delivery acceptance.

## Fill the deployment section of .env

| Variable | What to enter |
| --- | --- |
| `GITHUB_TOKEN` | GitHub personal access token with the permissions below |
| `VERCEL_TOKEN` | Vercel access token scoped to your chosen team |

These are the only new GitHub/Vercel inputs. Kickstart reads your GitHub username and accessible Vercel teams, derives unused repository/project names from `APP_NAME`, and obtains the production `vercel.app` address from Vercel. If several teams are available, choose one in the terminal. The read-only check does not save anything. After all required checks pass, setup saves the discovered names, owner, team, IDs and verified `APP_URL_LIVE` in `.env`. Keep those generated details for retries. The initial production branch is `main`.

Existing service requirements still apply: billing needs `STRIPE_LIVE_SECRET_KEY` from your activated Stripe account, and production email needs a verified sender. These cannot be obtained from a GitHub or Vercel token.

Optional overrides can be added when needed: `GITHUB_OWNER` for an organization, `GITHUB_REPO_NAME` / `VERCEL_PROJECT_NAME` for custom names, `VERCEL_TEAM_ID` for unattended setup with several teams, and `APP_URL_LIVE` for a custom HTTPS origin without a trailing slash. For an existing **empty private** repository, explicitly set its owner, name and numeric `GITHUB_REPO_ID`; populated repositories and unrelated Vercel projects are rejected rather than overwritten.

Keep existing Supabase credentials, Resend template IDs, hook secret and test Stripe configuration. Set `RESEND_TEST_MODE=false` and use a sender on your verified domain. `CONTACT_TO_EMAIL`, `AI_ENABLED`, `AI_MODEL`, `OPENROUTER_API_KEY`, `AUTH_EMAIL_VERIFICATION`, and `SEO_INDEXABLE` are included in production where applicable. Leave indexing disabled while customizing.

## Get the GitHub token

1. Open [GitHub fine-grained tokens](https://github.com/settings/personal-access-tokens). The navigation is Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.
2. Give it a recognizable name, such as `SaaS deployment`, and an expiration. Choose **your personal account** as the resource owner for the automatic path. To create in an organization instead, select that organization and add `GITHUB_OWNER=organization-name` to `.env`.
3. Choose **All repositories** so the token covers the new repository kickstart will create. If you prefer access limited to one repository, create an empty private repository yourself, choose **Only select repositories**, select it, and supply its owner/name/ID as described above.
4. Under repository permissions, select **Administration: Read and write** (repository creation) and **Contents: Read and write** (source push). Metadata read is included. If your customized source includes `.github/workflows`, also grant **Workflows: Read and write**. Organization policies may require administrator approval before the token works.
5. Generate the token and paste it into `GITHUB_TOKEN` in your local `.env`. Do not put it in chat, repository files, or Vercel environment variables.

The repository ID for an existing private repository is returned by GitHub's authenticated `GET /repos/OWNER/REPO` endpoint. If you already use GitHub CLI, `gh api repos/OWNER/REPO --jq .id` prints only the ID. A repository created by kickstart does not require you to look it up.

References: [GitHub token permissions and creation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [repository creation API](https://docs.github.com/en/rest/repos/repos#create-a-repository-for-the-authenticated-user).

## Get the Vercel token and authorize GitHub

1. Open [Vercel access tokens](https://vercel.com/account/tokens), then **Create Token**. Give it a name and expiration; select the team that should own the deployed app as its scope. Paste the token into `VERCEL_TOKEN`.
2. No team ID or project ID needs to be copied. Kickstart discovers them and creates the project; if several teams are accessible, select the intended one when prompted. For unattended runs only, an optional `VERCEL_TEAM_ID` can be copied from the team's **Settings → General → Team ID**.
3. Connect your GitHub account to your Vercel account, and [install/configure the Vercel GitHub App](https://github.com/apps/vercel/installations/new) for the repository owner. Grant it repository access. The GitHub token used by kickstart does not grant Vercel access by itself.
4. With selected-repository access, a newly created repository may need to be selected in the GitHub App installation after creation. Kickstart saves its ID and stops with the authorization link before changing the shared live services. Authorize it and rerun the same command. Granting the app access to all repositories avoids this second selection but gives it broader access.

References: [Vercel token instructions](https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token), [GitHub repository access](https://vercel.com/kb/guide/unable-to-find-github-repository), [Git-backed project creation](https://vercel.com/docs/rest-api/projects/create-a-new-project).

## Run

Install Git and the Node version required by package.json. Keep one kickstart process active at a time.

```sh
npm run kickstart:deploy -- --check
npm run kickstart:deploy
```

The first command is read-only against all providers. Missing GitHub/Vercel tokens, required Stripe keys and production email prerequisites are reported together before account discovery. Once configuration is complete, it validates source exclusions, account/team/repository identity, the Vercel GitHub installation, observable project access, and every enabled Supabase/Resend/Stripe/AI preflight. A required failure prevents every provider write. Read-only inspection cannot prove create/push/deploy permissions, access to a not-yet-created repository, domain ownership or a successful build. The output states those limits.

After checks pass, deployment:

1. Creates or reuses the designated private repository and saves its identifiers.
2. Uploads a source snapshot through an isolated temporary Git checkout, without altering the source folder's Git history, index or remotes. The commit is authored as the authenticated GitHub user, with their GitHub noreply address. Unrelated remote commits stop setup; there is no force-push.
3. Creates the Git-linked Next.js project with `npm ci`, `npm run build`, and previews disabled. Reuses only a project recorded by this installation, including recovery from a lost creation response.
4. Reads the production `vercel.app` domain assigned to the project and checks verification/routing before saving `APP_URL_LIVE`. If Vercel has not supplied an unambiguous domain, setup pauses with an actionable error. For an optional custom domain, follow **Vercel Project → Settings → Domains** to add the exact DNS records Vercel supplies, then rerun. No domain purchase or registrar changes are automated. A `vercel.app` origin must actually belong to this project; guessed/unavailable aliases fail verification.
5. Rechecks every enabled service using the verified production origin, records the origin transition, then runs the existing hosted migrations/Auth/email/MCP configuration and live Stripe catalog/webhook/portal provisioning. Billing disabled in `config/billing-seed.json` stays disabled.
6. Uploads the explicit production runtime allowlist from `scripts/kickstart/deploy-config.mjs`. Server credentials use Vercel's sensitive variable type. It never bulk-uploads `.env`, copies the Supabase management token, or sends the opposite Stripe mode. Sensitive values cannot be read back; installation verifies metadata and subsequent application behavior, not plaintext equality.
7. Creates a production deployment for the recorded Git commit and waits up to ten minutes, printing progress. Lost responses are reconciled using deployment metadata; subsequent runs reuse the saved deployment ID. READY plus successful public `/` and `/login` HTTPS checks is reported separately from authenticated/payment acceptance.

## Source boundary and future development

`config/deployment.json` explicitly lists source paths to publish. Standard application/configuration/documentation/tests and public assets are included. Local `.env` files, provider receipts, secrets, dependencies, build output, screenshots/reports and scratch directories are excluded. `.env.example` is included. The snapshot rejects symlinks, path escapes, configured secret values and recognizable private-key/token formats. Review your public/source content too: a credential scanner is not a complete detector of confidential data. It does not upload local Git history.

After bootstrap, clone the new GitHub repository for ordinary development. Push changes to `main` to deploy through Vercel's GitHub integration. Retain the original setup folder with its `.env`, `.kickstart` and `.secrets` files privately for provider reconciliation. This initial installer deliberately refuses to overwrite a repository that has advanced beyond its recorded commit, or to upload changed source after Vercel is linked. Changes to the initialized application should use ordinary Git. Reconciliation after external commits requires explicitly updating the deployment tooling/state with a verified target; do not delete receipts to bypass the guard.

## Shared origin, retries and recovery

Development and production share one hosted Supabase project and Resend setup. Deployment applies `APP_URL_LIVE` to hosted Auth links and the MCP OAuth audience, while the local `.env` `APP_URL` stays unchanged. Existing OAuth clients need to reconnect. Automatic previews are disabled because arbitrary preview URLs cannot share that single Auth/MCP origin safely.

Once the production transition starts, ordinary kickstart stops rather than silently resetting the hosted origin. To intentionally restore the local configuration, set `APP_URL` to the desired local origin and run `npm run kickstart -- --restore-local`. This affects production Auth/email/MCP; it is not an app-only rollback. Vercel code rollback also does not undo database or Stripe changes.

Keep `.kickstart/deploy-<project-ref>.json`, the existing Supabase/Stripe receipts, and `.secrets`. Deployment state contains resource identities, commit hashes, operation markers and configuration fingerprints, not raw credentials. Name collisions, changed IDs, changed managed Vercel settings/variables, or unrecorded remote commits stop setup and preserve buyer changes. Fix access/DNS failures and rerun; no cross-provider rollback or database reset is attempted.

A build failure preserves provider resources and the failed deployment for inspection. Fix code through Git and use Vercel's normal deployment workflow; the initial setup does not pretend the failed build succeeded. Failed page checks can be retried after DNS or deployment-protection configuration is corrected. The installer does not automatically weaken deployment protection.

`.kickstart/install.lock` prevents concurrent local core/deploy runs. A terminated process normally removes its own lock. After a machine crash, first confirm no kickstart process remains, then remove only that stale lock file; retain all receipt JSON files.

## Acceptance on your installation

Verify real repository creation/push and GitHub App authorization; Vercel environment installation/build/domain behavior; Stripe live promotion; production signup/login/recovery/invitation delivery; real deployed Claude connection; and a fresh buyer installation. Configure public ingress rate limits and appropriate access-log redaction before launch. This implementation does not claim those external checks passed.

API references checked: [Vercel environment variables](https://vercel.com/docs/rest-api/projects/create-one-or-more-environment-variables), [deployment creation](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), [domain attachment](https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project).
