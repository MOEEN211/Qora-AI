import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createApi, validateConfig } from "./kickstart/core.mjs";

try {
  const env = { ...process.env, ...parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8")) };
  if (validateConfig(env).length || env.HOSTED_TEST_PROJECT_REF !== env.SUPABASE_PROJECT_REF) throw new Error("Set valid .env values and explicitly set HOSTED_TEST_PROJECT_REF to your NEW test project. No tests were run.");
  const api = createApi(env);
  const [info] = await api.query("select to_regclass('private.kickstart_migrations') is not null as installed");
  if (!info.installed) throw new Error("Run kickstart before hosted isolation tests.");
  const [operator] = await api.query("select to_regclass('private.operator_users') is not null as installed");
  if (operator.installed) {
    await api.query(await readFile(new URL('../tests/database/admin-isolation.sql',import.meta.url),'utf8'),false);
    console.log('Admin checks passed: operator/session boundaries, read-only customer projections, grants/revocations, activity deduplication and last-admin deletion protection. Fixtures rolled back.');
  }
  await api.query(await readFile(new URL("../tests/database/onboarding-isolation.sql", import.meta.url), "utf8"), false);
  console.log("Onboarding passed: account isolation, progress, terminal skip/completion, validation, signup and deletion. Fixtures rolled back.");
  await api.query(await readFile(new URL("../tests/database/blog-isolation.sql", import.meta.url), "utf8"), false);
  console.log("Blog checks passed: public published reads, hidden drafts/future posts, anonymous/customer write denial. Fixtures rolled back.");
  await api.query(await readFile(new URL("../tests/database/notification-preferences.sql", import.meta.url), "utf8"), false);
  console.log("Notification preferences passed: enabled signup defaults, isolated writes, email lookup, gated in-app creation and account cleanup. Fixtures rolled back.");
  await api.query(await readFile(new URL("../tests/database/notifications-isolation.sql", import.meta.url), "utf8"), false);
  console.log("Notification checks passed: signup welcome, retry deduplication, account isolation, restricted read-status updates, mark all, verification gating and deletion cascades. All fixtures rolled back.");
  await api.query(await readFile(new URL("../tests/database/tenant-isolation.sql", import.meta.url), "utf8"), false);
  await api.query(await readFile(new URL("../tests/database/settings-isolation.sql", import.meta.url), "utf8"), false);
  await api.query(await readFile(new URL("../tests/database/workspace-isolation.sql", import.meta.url), "utf8"), false);
  await api.query(await readFile(new URL("../tests/database/workspace-ownership.sql", import.meta.url), "utf8"), false);
  await api.query(await readFile(new URL("../tests/database/workspace-invitation-roles.sql", import.meta.url), "utf8"), false);
  await api.query(await readFile(new URL("../tests/database/workspace-logos.sql", import.meta.url), "utf8"), false);
  console.log("Workspace checks passed: creation retries, owner/admin/member permissions, invited bootstrap and verification gating, token lifecycle, fallback workspaces, key revocation, and deletion. All SQL fixtures rolled back.");
  await api.query(await readFile(new URL("../tests/database/feedback-isolation.sql", import.meta.url), "utf8"), false);
  console.log("Feedback checks passed: shared search, private reports/identities, verified-user access, tenant attribution, idempotent votes/submissions, limits, and deletion cleanup. All SQL fixtures rolled back.");
  console.log("Settings checks passed: API-key scope, expiry, revocation, rate limits, secret isolation, avatar isolation, deletion ownership guards, cascade cleanup, and stale-session denial. All SQL fixtures rolled back.");
  const [integrations] = await api.query("select to_regclass('private.mcp_connections') is not null as installed");
  if (integrations.installed) {
    await api.query(await readFile(new URL("../tests/database/integrations-isolation.sql", import.meta.url), "utf8"), false);
    console.log("Integration SQL checks passed: tenant consent/revocation isolation, OAuth role restrictions, provider hook privileges, identity/session checks, quota, refresh-session binding, demotion and deletion. Fixtures rolled back; browser consent and client compatibility are separate tests.");
  }
  const [billing] = await api.query("select to_regclass('private.billing_accounts') is not null as installed");
  if (billing.installed) {
    if (operator.installed) {
      await api.query(await readFile(new URL('../tests/database/admin-billing-reporting.sql',import.meta.url),'utf8'),false);
      console.log('Admin accounting checks passed: MRR, cohort churn, payment retries, recovery, retained deleted-workspace history and stale/gap coverage. Fixtures rolled back.');
    }
    await api.query(await readFile(new URL("../tests/database/billing-isolation.sql", import.meta.url), "utf8"), false);
    console.log("Billing SQL checks passed: per-workspace/mode isolation, member restrictions, privileged writes, lease fencing, replay deduplication, durable mapping and deletion guards. Fixtures rolled back; actual Stripe payment/webhook acceptance is separate.");
  }
  console.log("Hosted database checks passed: atomic ordinary signup, tenant read/write isolation, owner rename, role-mutation denial, and unverified-user denial. Test fixtures rolled back. Email delivery and browser signup are separate checks.");
} catch (error) { console.error(error.code === "ENOENT" ? "Add your new test project's .env before running hosted tests." : error.message); process.exitCode = 1; }
