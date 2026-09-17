import { readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { createApi, digest, executeSetup, runPreflight, migrationQuery, checkSender, functionReceipt, matchesFunctionReceipt } from "./core.mjs";
import { loadTemplates, inspectTemplates, publishTemplate } from "./templates.mjs";
import { saveGeneratedEnv } from "./env-file.mjs";
import { setupEnvironment } from "./environment.mjs";
import { verificationEnabled } from "../../lib/email/verification.mjs";
import { integrationAuthSettings, integrationProbe, integrationStep } from "./integrations.mjs";
import { checkAI, verifyAI } from "./ai.mjs";
import { verifyNotificationPreferences } from "./notification-preferences.mjs";
import { verifyNotifications } from "./notifications.mjs";
import { verifyBlog } from "./blog.mjs";
import { verifyOnboarding } from "./onboarding.mjs";
import { verifyAdmin } from "./admin.mjs";
import { open } from "node:fs/promises";
import { readFileSync, unlinkSync } from "node:fs";
import { deploymentReceiptPath } from "./deploy.mjs";
import { deploymentInputErrors } from "./deploy-config.mjs";
import { bootstrapSetup, readBootstrapState, completeBootstrap } from "./bootstrap.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
if (args.some(arg => !["--check", "--deploy", "--restore-local"].includes(arg)) || (args.includes("--deploy") && args.includes("--restore-local"))) { console.error("Usage: npm run kickstart [-- --check|--restore-local] or npm run kickstart:deploy [-- --check]"); process.exit(1); }
let env;
try { env = { ...process.env, ...parseEnv(await readFile(resolve(root, ".env"), "utf8")) }; }
catch { console.error("Copy .env.example to .env and add SUPABASE_ACCESS_TOKEN, RESEND_API_KEY and STRIPE_TEST_SECRET_KEY. No changes made."); process.exit(1); }

const deploy = args.includes("--deploy");
// A single local installer owns the shared Auth/email configuration at a time.
if (!args.includes("--check")) {
  await mkdir(resolve(root, ".kickstart"), { recursive: true });
  const lockPath = resolve(root, ".kickstart", "install.lock");
  const owner = `${process.pid}:${randomBytes(16).toString("hex")}`;
  let handle;
  try { handle = await open(lockPath, "wx"); }
  catch { console.error("Another kickstart may be running. See docs/DEPLOYMENT.md for stale install.lock recovery."); process.exit(1); }
  process.once("exit", () => { try { if (readFileSync(lockPath, "utf8") === owner) unlinkSync(lockPath); } catch { /* Preserve another process's lock. */ } });
  await handle.writeFile(owner); await handle.close();
}
let bootstrapState;
try {
  bootstrapState = await readBootstrapState(root);
  if (bootstrapState?.project && env.SUPABASE_PROJECT_REF && bootstrapState.project !== env.SUPABASE_PROJECT_REF) throw new Error("Supabase project differs from the bootstrap receipt. Restore the matching .env and receipt.");
  env.SUPABASE_PROJECT_REF ||= bootstrapState?.project || "";
} catch (error) { console.error(error.message); process.exit(1); }
const deploymentStatePath = deploymentReceiptPath(root, env.SUPABASE_PROJECT_REF);
let deploymentState;
try { deploymentState = JSON.parse(await readFile(deploymentStatePath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") { console.error("Restore the unreadable deployment receipt before setup."); process.exit(1); } }
if (!deploy && deploymentState?.liveActivated && !args.includes("--restore-local")) {
  console.error("This shared Supabase project has a production origin. Use kickstart:deploy to reconcile production. To intentionally switch Auth/email/MCP back to APP_URL, run npm run kickstart -- --restore-local (production authentication will be affected)."); process.exit(1);
}
const billingSettings = JSON.parse(await readFile(resolve(root, "config/billing-seed.json"), "utf8"));
const billingEnabled = billingSettings.enabled !== false;
let bootstrap = { generated: {} };
if (!deploy) {
  try {
    bootstrap = await bootstrapSetup({ root, env, state: bootstrapState, checkOnly: args.includes("--check") });
    env = bootstrap.env;
    // A recovered reference must also be written back after the full preflight.
    if (bootstrapState?.project) bootstrap.generated.SUPABASE_PROJECT_REF = bootstrapState.project;
    if (bootstrap.checked) { console.log("Account checks passed. Run npm run kickstart to create/resume the hosted project and complete project-level checks."); process.exit(0); }
  } catch (error) { console.error(`${error.message}\nSetup stopped. Saved provider resources are preserved; fix the issue and rerun.`); process.exit(1); }
}
const sourceProjectRef = env.SUPABASE_PROJECT_REF;
let discovery;
if (deploy) {
  const errors = deploymentInputErrors(env, billingEnabled);
  if (errors.length) {
    errors.forEach(message => console.error(`FAIL Deployment configuration: ${message}`));
    console.error("Deployment prerequisites are incomplete. No provider changes made; account/service checks have not run.");
    process.exit(1);
  }
  try {
    const { discoverDeployment } = await import("./deploy-discovery.mjs");
    discovery = await discoverDeployment({ env, state: deploymentState });
    env = discovery.env;
    console.log(`Discovered deployment: ${env.GITHUB_OWNER}/${env.GITHUB_REPO_NAME}; Vercel project ${env.VERCEL_PROJECT_NAME}.`);
  } catch (error) { console.error(`${error.message}\nDeployment discovery stopped. No provider changes made.`); process.exit(1); }
}
env = setupEnvironment(env, deploy);
const saveSetupEnv = values => saveGeneratedEnv(resolve(root, ".env"), values);
const templates = await loadTemplates(root, env);
const handlerSource = await readFile(resolve(root, "supabase/functions/send-auth-email/handler.mjs"), "utf8");
const entrySource = await readFile(resolve(root, "supabase/functions/send-auth-email/index.js"), "utf8");
// Deploy one module; pin the only external dependency in the source entrypoint.
const functionSource = handlerSource + "\n" + entrySource.replace('import { createEmailHook } from "./handler.mjs";', "");
const functionSlug = `forma-auth-email-${digest(functionSource).slice(0, 12)}`;
const files = (await readdir(resolve(root, "supabase/migrations"))).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
const migrations = await Promise.all(files.map(async name => ({ name, sql: await readFile(resolve(root, "supabase/migrations", name), "utf8") })));
const api = createApi(env);
const integrations = JSON.parse(await readFile(resolve(root,"config/integrations.json"),"utf8"));
const desiredAuth = {
  ...integrationAuthSettings(integrations),
  site_url: env.APP_URL,
  uri_allow_list: `${env.APP_URL}/auth/confirm,${env.APP_URL}/auth/confirm?flow=magic,${env.APP_URL}/auth/callback`,
  disable_signup: false,
  external_email_enabled: true,
  mailer_autoconfirm: !verificationEnabled(env.AUTH_EMAIL_VERIFICATION),
  password_min_length: 12,
  hook_send_email_enabled: true,
  hook_send_email_uri: `${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${functionSlug}`,
};
const fingerprint = value => digest(JSON.stringify(value ?? null));
const managed = Object.keys(desiredAuth);
const safeRef = /^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF || "") ? env.SUPABASE_PROJECT_REF : "invalid";
const statePath = resolve(root, ".kickstart", `${safeRef}.json`);
let receipt;
try { receipt = JSON.parse(await readFile(statePath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") { console.error("The local kickstart receipt is unreadable. Restore it before continuing."); process.exit(1); } }
if (receipt && receipt.project !== env.SUPABASE_PROJECT_REF) { console.error("Kickstart receipt target mismatch. No changes made."); process.exit(1); }
let currentAuth, currentFunction, currentSecrets, hasLedger = false;
const secretNames = ["FORMA_RESEND_API_KEY", "FORMA_RESEND_FROM_EMAIL", "FORMA_RESEND_TEMPLATE_VERIFICATION_ID", "FORMA_RESEND_TEMPLATE_PASSWORD_RESET_ID", "FORMA_APP_URL", "FORMA_EMAIL_HOOK_SECRET", "FORMA_RESEND_TEMPLATE_MAGIC_LINK_ID"];

const probes = [
  integrationProbe(integrations,api,env),
  { name: "OpenRouter configuration", run: () => {
    return checkAI(env);
  } },
  { name: "Supabase project", run: async () => {
    const project = await api.management("");
    if (project.id !== env.SUPABASE_PROJECT_REF || project.status !== "ACTIVE_HEALTHY") throw new Error("Project identity or health did not match. Wait until the new hosted project is healthy.");
    return project.name;
  } },
  { name: "Supabase publishable key and Google provider", run: async () => {
    const settings = await api.authSettings();
    console.log(settings.external?.google ? "Google provider enabled in Supabase. Actual consent and sign-in must be verified in a browser." : "Google provider disabled in Supabase. Configure Google credentials only in Supabase Authentication > Sign In / Providers > Google to enable the button. Email authentication remains available.");
    return "Public Auth settings checked. Google credentials remain managed only in Supabase.";
  } },
  { name: "Supabase server-only key", run: () => api.checkServerKey() },
  { name: "Database access and migration history", run: async () => {
    const [info] = await api.query("select to_regclass('private.kickstart_migrations') is not null as ledger, (select count(*)::int from pg_tables where schemaname = 'public') as tables, (select count(*)::int from auth.users) as users");
    hasLedger = info.ledger;
    if (!hasLedger && (info.tables > 0 || info.users > 0)) throw new Error("This project is not empty and has no kickstart history. Use a NEW hosted project; nothing will be overwritten.");
    if (hasLedger) {
      const rows = await api.query("select version, checksum from private.kickstart_migrations");
      for (const row of rows) {
        const migration = migrations.find(m => m.name === row.version);
        if (!migration || digest(migration.sql) !== row.checksum) throw new Error("Migration history does not match this repository. Restore original migrations before retrying.");
      }
    }
    return "Hosted SQL access verified.";
  } },
  { name: "Auth configuration access", run: async () => {
    currentAuth = await api.management("/config/auth");
    if (!receipt && currentAuth.hook_send_email_enabled) throw new Error("This project already has an email hook. Use a NEW project or restore its kickstart receipt.");
    if (receipt && currentAuth.hook_send_email_enabled && !env.SUPABASE_EMAIL_HOOK_SECRET) throw new Error("Restore SUPABASE_EMAIL_HOOK_SECRET in .env before resuming an installed email hook.");
    if (receipt) for (const key of managed) {
      const current = fingerprint(currentAuth[key]);
      const expected = fingerprint(desiredAuth[key]);
      const previous = receipt.auth?.[key];
      if (previous && current !== expected && current !== previous.before && current !== previous.after) throw new Error(`Auth setting ${key} changed outside kickstart. Reconcile it before continuing; buyer changes are preserved.`);
    }
    return "Read access verified; write permission is confirmed during provisioning.";
  } },
  { name: "Resend account and sender domain", run: () => checkSender(env, api) },
  { name: "Resend template access and ownership", run: () => inspectTemplates(api, templates, env) },
  { name: "Hosted email function and secrets access", run: async () => {
    const functions = await api.management("/functions");
    currentFunction = functions.find(item => item.slug === functionSlug);
    if (currentFunction && !matchesFunctionReceipt(currentFunction, receipt?.emailFunction)) throw new Error("The email function has unexpected state or no matching receipt. Reconcile it before continuing.");
    currentSecrets = await api.management("/secrets");
    for (const name of secretNames) {
      const existing = currentSecrets.find(item => item.name === name);
      const previous = receipt?.secrets?.[name];
      if (existing && (!previous || ![previous.before, previous.after].includes(existing.value))) throw new Error(`Hosted secret ${name} changed outside kickstart. Reconcile it before continuing.`);
    }
    return "Read access verified. Function deployment and secret write permissions are confirmed during provisioning.";
  } },
];

async function saveReceipt() {
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath + ".tmp", JSON.stringify(receipt, null, 2), { mode: 0o600 });
  await rename(statePath + ".tmp", statePath);
}
const steps = [
  { name: "Save discovered environment settings", run: () => Object.keys(bootstrap.generated).length ? saveSetupEnv(bootstrap.generated) : undefined },
  { name: "Record target and configuration fingerprints", run: async () => {
    if (!receipt && hasLedger && managed.some(key => fingerprint(currentAuth[key]) !== fingerprint(desiredAuth[key]))) throw new Error("Local receipt is missing for an existing installation. Restore .kickstart state or explicitly reconcile Auth settings before resuming.");
    receipt = { ...receipt, project: env.SUPABASE_PROJECT_REF, auth: Object.fromEntries(managed.map(key => [key, { before: fingerprint(currentAuth[key]), after: fingerprint(desiredAuth[key]) }])) };
    if (currentFunction) receipt.emailFunction = functionReceipt(currentFunction);
    await saveReceipt();
  } },
  ...templates.map(template => ({ name: `Publish Resend ${template.kind} template and save ID`, run: () => publishTemplate(api, template, async (key, id) => {
    await saveSetupEnv({ [key]: id });
    env[key] = id;
  }) })),
  ...migrations.filter(migration => {
    if (migration.name.includes('_operator_billing_')) return billingEnabled;
    if (migration.name.includes('_operator_ai_')) return env.AI_ENABLED === 'true';
    if ((migration.name.endsWith("_account_subscriptions.sql") || migration.name.endsWith("_billing_runtime_configuration.sql"))) return billingEnabled;
    if (/_workspace_ai(?:_[a-z_]+)?\.sql$/.test(migration.name)) return env.AI_ENABLED === "true";
    return true;
  }).map(migration => ({ name: `Migration ${migration.name}`, run: () => api.query(migrationQuery(migration.name, migration.sql), false) })),
  integrationStep(integrations,api,env),
  { name: "Install scoped email secrets", run: async () => {
    if (!env.SUPABASE_EMAIL_HOOK_SECRET) {
      env.SUPABASE_EMAIL_HOOK_SECRET = `v1,whsec_${randomBytes(32).toString("base64")}`;
      await saveSetupEnv({ SUPABASE_EMAIL_HOOK_SECRET: env.SUPABASE_EMAIL_HOOK_SECRET });
    }
    const values = [env.RESEND_API_KEY, env.RESEND_FROM_EMAIL, env.RESEND_TEMPLATE_VERIFICATION_ID, env.RESEND_TEMPLATE_PASSWORD_RESET_ID, env.APP_URL, env.SUPABASE_EMAIL_HOOK_SECRET, env.RESEND_TEMPLATE_MAGIC_LINK_ID];
    const secrets = secretNames.map((name, index) => ({ name, value: values[index] }));
    receipt.secrets = Object.fromEntries(secrets.map(({ name, value }) => [name, { before: currentSecrets.find(item => item.name === name)?.value ?? null, after: digest(value) }]));
    await saveReceipt();
    if (secrets.some(item => currentSecrets.find(secret => secret.name === item.name)?.value !== digest(item.value))) {
      await api.management("/secrets", { method: "POST", body: JSON.stringify(secrets) });
    }
    const actual = await api.management("/secrets");
    if (secrets.some(item => actual.find(secret => secret.name === item.name)?.value !== digest(item.value))) throw new Error("Email secret installation could not be verified. Rerun to resume.");
  } },
  { name: "Deploy signed hosted email hook", run: async () => {
    if (currentFunction) return;
    // Record expected version before deployment so a lost response is recoverable.
    receipt.emailFunction = { slug: functionSlug, version: 1 };
    await saveReceipt();
    const body = new FormData();
    body.append("metadata", JSON.stringify({ entrypoint_path: "index.js", name: functionSlug, verify_jwt: false }));
    body.append("file", new Blob([functionSource], { type: "application/javascript" }), "index.js");
    const deployed = await api.management(`/functions/deploy?slug=${functionSlug}`, { method: "POST", body });
    if (deployed.slug !== functionSlug || deployed.status !== "ACTIVE" || deployed.verify_jwt !== false) throw new Error("Email function deployment could not be verified.");
    receipt.emailFunction = functionReceipt(deployed);
    await saveReceipt();
  } },
  { name: "Configure verification preference and API email delivery", run: async () => {
    // Setting the same managed fields twice is safe; arbitrary provider settings remain untouched.
    await api.management("/config/auth", { method: "PATCH", body: JSON.stringify({ ...desiredAuth, hook_send_email_secrets: env.SUPABASE_EMAIL_HOOK_SECRET }) });
    const actual = await api.management("/config/auth");
    for (const key of managed) if (fingerprint(actual[key]) !== fingerprint(desiredAuth[key])) throw new Error(`Auth configuration verification failed for ${key}. Rerun to resume safely.`);
  } },
  { name: "Verify tenant policies and signup trigger", run: async () => {
    const rows = await api.query("select c.relname, c.relrowsecurity, (select count(*)::int from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','organizations','organization_members') and c.relkind='r'");
    if (rows.length !== 3 || rows.some(row => !row.relrowsecurity || row.policies < 1)) throw new Error("Expected tenant tables/policies were not found.");
    const [trigger] = await api.query("select exists(select 1 from pg_trigger where tgname='on_auth_user_created' and tgrelid='auth.users'::regclass and tgenabled <> 'D') as active");
    if (!trigger.active) throw new Error("The signup workspace trigger is missing or disabled.");
  } },
  { name: "Verify workspace lifecycle permissions", run: async () => {
    const [workspace] = await api.query(`/* workspace-verification */ select
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private'
        and c.relname in ('workspace_policy','workspace_creations','workspace_invitations','workspace_invitation_sends') and c.relrowsecurity
        and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as protected_tables,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
        and p.proname in ('create_workspace','workspace_team','issue_workspace_invitation','revoke_workspace_invitation','accept_workspace_invitation','change_workspace_member','transfer_workspace_ownership','set_workspace_logo')
        and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) as guarded_functions,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
        and p.proname in ('delete_workspace','record_invitation_send') and has_function_privilege('service_role',p.oid,'EXECUTE')
        and not has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) as server_functions,
      (select c.relrowsecurity and has_table_privilege('authenticated',c.oid,'SELECT')
        and not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
        and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
        from pg_class c where c.oid=to_regclass('public.workspace_logos')) as logo_ready`);
    if(workspace.protected_tables!==4||workspace.guarded_functions!==8||workspace.server_functions!==2||!workspace.logo_ready)throw new Error('Workspace lifecycle permissions are incomplete. Check workspace migrations.');
  } },
  { name: "Verify notification storage, permissions and welcome backfill", run: () => verifyNotifications(api) },
  { name: "Verify onboarding storage, transitions and account isolation", run: () => verifyOnboarding(api) },
  { name: "Verify operator authorization and reporting", run: () => verifyAdmin(api) },
  { name: "Verify public blog storage and read-only permissions", run: () => verifyBlog(api) },
  { name: "Verify notification preferences and delivery guards", run: () => verifyNotificationPreferences(api) },
  { name: "Verify feedback storage and permissions", run: async () => {
    const [feedback] = await api.query(`/* feedback-verification */ select
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='private' and c.relname in ('bug_reports','feature_requests','feature_votes') and c.relrowsecurity
        and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')
        and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')) as protected_tables,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname in ('public','private') and p.proname in ('submit_feedback','search_feature_requests','set_feature_vote')
        and has_function_privilege('authenticated',p.oid,'EXECUTE') and not has_function_privilege('anon',p.oid,'EXECUTE')) as guarded_functions`);
    if (feedback.protected_tables !== 3 || feedback.guarded_functions !== 6) throw new Error("Feedback storage or RPC permissions are missing. Inspect the feedback migration before continuing.");
  } },
];

if (billingEnabled) {
  const { createBillingSetup } = await import("./billing.mjs");
  const billing = await createBillingSetup({ root, env, api, deploy, sourceProjectRef });
  probes.push(billing.probe);
  steps.push(billing.step);
}
if (env.AI_ENABLED === "true") steps.push({ name: "Verify AI storage permissions and recovery schedule", run: () => verifyAI(api) });
if (deploy) {
  const { createDeploymentSetup } = await import("./deploy.mjs");
  const deployment = await createDeploymentSetup({ root, env, billingEnabled, discovery });
  probes.push(deployment.probe);
  steps.unshift(deployment.prepare, { name: "Recheck services with verified production origin", run: async () => {
    desiredAuth.site_url = env.APP_URL;
    desiredAuth.uri_allow_list = `${env.APP_URL}/auth/confirm,${env.APP_URL}/auth/confirm?flow=magic,${env.APP_URL}/auth/callback`;
    const checked = await runPreflight(env, probes.filter(probe => probe !== deployment.probe));
    checked.results.filter(result => !result.ok).forEach(result => console.error(`FAIL ${result.name}: ${result.message}`));
    if (!checked.ok) throw new Error("Production-origin preflight failed. Repository/project are preserved; shared services have not been switched by this run.");
  } }, deployment.activate);
  steps.push(deployment.finish);
}
console.log(`Forma kickstart · Auth, workspace, settings, notifications, feedback, email${billingEnabled ? ` and Stripe ${deploy ? "LIVE" : "TEST"}` : ""}`);
console.log("Preflight is read-only. No emails or AI generations are sent.");
if (env.RESEND_TEST_MODE === "true") console.log("Resend TEST MODE: use your exact Resend account email when signing up. Other recipients will be rejected by Resend.");
if (deploy && env.RESEND_TEST_MODE === "true") console.log("Temporary deployment with the Resend onboarding sender: email is NOT ready for general users. Live Stripe billing remains enabled when configured.");
const result = await executeSetup({ env, probes, steps, checkOnly: args.includes("--check"), log: item => console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.message ? `: ${item.message}` : ""}`) });
if (result.status === "blocked") { console.error(bootstrap.created ? "Project-level preflight failed. The created hosted project and its keys are preserved for retry; application provisioning has not started." : "Preflight failed. No provisioning changes made."); process.exitCode = 1; }
else if (result.status === "partial") { console.error(`Stopped at ${result.failed}: ${result.message}\nPrevious completed steps remain. Fix the issue and rerun; no rollback or reset is attempted.`); process.exitCode = 1; }
else if (result.status === "checked") console.log(`Required checks passed. No provisioning changes made. Run npm run ${deploy ? "kickstart:deploy" : "kickstart"} to provision.`);
else {
  if (!deploy) await completeBootstrap(root, env.SUPABASE_PROJECT_REF);
  if (!deploy && args.includes("--restore-local") && deploymentState) {
    deploymentState.liveActivated = false;
    await writeFile(deploymentStatePath + ".tmp", JSON.stringify(deploymentState, null, 2), { mode: 0o600 });
    await rename(deploymentStatePath + ".tmp", deploymentStatePath);
  }
  console.log(`Configuration verified. Generated IDs are saved in .env. Email verification: ${verificationEnabled(env.AUTH_EMAIL_VERIFICATION) ? "on" : "off"}. ${deploy ? "Vercel production deployment and public page checks passed. Local APP_URL is preserved; shared Auth/email/MCP now use APP_URL_LIVE. See docs/DEPLOYMENT.md." : "Restart npm run dev."} Verify actual email, subscription payment/webhook, and settings flows separately. Configuration checks do not prove successful payment or email delivery. AI streaming and workspace-credit flows require separate end-to-end verification; see docs/AI.md.`);
}
