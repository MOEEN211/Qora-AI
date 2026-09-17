import { randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { createApi, checkSender, digest, validateConfig } from "./core.mjs";
import { checkAI } from "./ai.mjs";

const projectKeys = ["SUPABASE_PROJECT_REF", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
const refPattern = /^[a-z]{20}$/;
const projectRef = project => project?.ref || project?.id;
const localOrigin = value => ["localhost", "127.0.0.1"].includes(new URL(value).hostname);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function readBootstrapState(root) {
  try {
    const state = JSON.parse(await readFile(join(root, ".kickstart/bootstrap.json"), "utf8"));
    if (state.version !== 1 || !state.organization || !state.name || !state.region || !state.resendKeyHash || (state.project && !refPattern.test(state.project))) throw new Error();
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error("Restore the unreadable .kickstart/bootstrap.json receipt before retrying.");
  }
}

async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
}

export async function completeBootstrap(root, ref) {
  const state = await readBootstrapState(root);
  if (!state || state.complete) return;
  if (state.project !== ref) throw new Error("Bootstrap completion target mismatch.");
  state.complete = true;
  await saveJson(join(root, ".kickstart/bootstrap.json"), state);
}

export async function chooseBootstrapOption(label, options, override) {
  if (options.length === 1) return options[0].value;
  if (!options.length) throw new Error(`No available ${label}. Configure your provider account first.`);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error(`Multiple ${label} are available. Run kickstart in an interactive terminal or set ${override} in .env.`);
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    options.forEach((option, index) => console.log(`${index + 1}. ${String(option.label).replace(/[\x00-\x1f\x7f-\x9f]/g, "")}`));
    const answer = await terminal.question(`Choose ${label} (number): `);
    if (!/^\d+$/.test(answer) || !options[Number(answer) - 1]) throw new Error("No valid selection. No provider changes made.");
    return options[Number(answer) - 1].value;
  } finally { terminal.close(); }
}

export function bootstrapManagement(token, fetcher = fetch) {
  return async (path, body) => {
    let response;
    try {
      response = await fetcher(`https://api.supabase.com/v1${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(body === undefined ? 20000 : 60000),
      });
    } catch { throw new Error("Supabase request timed out or failed. Rerun to reconcile saved setup progress."); }
    if (!response.ok) {
      // Never include provider bodies, credentials or generated passwords in errors.
      const error = new Error(`Supabase returned HTTP ${response.status}. Check token permissions, organization project quota and billing, then rerun. A pending creation will be reconciled, never blindly repeated.`);
      error.definitelyRejected = [400, 401, 403, 422, 429].includes(response.status);
      throw error;
    }
    try { return await response.json(); }
    catch { throw new Error("Supabase returned an unreadable response. Rerun to reconcile saved setup progress."); }
  };
}

export async function checkBootstrapStripe(env) {
  if (!/^[sr]k_test_/.test(env.STRIPE_TEST_SECRET_KEY || "")) throw new Error("Fill STRIPE_TEST_SECRET_KEY with your Stripe sandbox Secret key (sk_test_...), or a restricted test key with the documented permissions.");
  const [{ default: Stripe }, { STRIPE_API_VERSION }] = await Promise.all([import("stripe"), import("../../lib/billing/engine.mjs")]);
  const stripe = new Stripe(env.STRIPE_TEST_SECRET_KEY, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 0, timeout: 20000 });
  try {
    const account = await stripe.accounts.retrieve();
    const reads = await Promise.all([
      stripe.products.list({ limit: 1 }), stripe.prices.list({ limit: 1 }),
      stripe.customers.list({ limit: 1 }), stripe.subscriptions.list({ limit: 1 }),
      stripe.checkout.sessions.list({ limit: 1 }), stripe.invoices.list({ limit: 1 }),
      stripe.webhookEndpoints.list({ limit: 1 }), stripe.billingPortal.configurations.list({ limit: 1 }),
    ]);
    if (!account.id || reads.some(page => !Array.isArray(page.data) || page.data.some(row => row.livemode !== false))) throw new Error();
    return account.id;
  } catch { throw new Error("Stripe sandbox preflight failed. Check the test key and account/catalog/customer/subscription/invoice/Checkout/webhook/portal read permissions. No project has been created by this run."); }
}

export async function discoverSender(env, api, choose = chooseBootstrapOption) {
  const domains = await api.domains();
  if (env.RESEND_FROM_EMAIL) {
    env.RESEND_TEST_MODE ||= env.RESEND_FROM_EMAIL === "onboarding@resend.dev" ? "true" : "false";
  } else {
    const verified = domains.filter(domain => domain.status === "verified" && domain.capabilities?.sending !== "disabled");
    if (env.RESEND_TEST_MODE !== "true" && verified.length) {
      const domain = await choose("Resend sending domains", verified.map(item => ({ label: item.name, value: item.name })), "RESEND_FROM_EMAIL");
      if (!verified.some(item => item.name === domain) || !/^[a-zA-Z0-9.-]+$/.test(domain)) throw new Error("Invalid Resend domain selection.");
      env.RESEND_FROM_EMAIL = `noreply@${domain}`;
      env.RESEND_TEST_MODE = "false";
    } else {
      if (env.RESEND_TEST_MODE === "false" || !localOrigin(env.APP_URL)) throw new Error("No verified sending domain is available. Verify a Resend domain and set RESEND_FROM_EMAIL, or allow automatic test mode with a local APP_URL.");
      env.RESEND_FROM_EMAIL = "onboarding@resend.dev";
      env.RESEND_TEST_MODE = "true";
    }
  }
  await checkSender(env, { domains: async () => domains });
  const templates = await api.resendList("/templates");
  for (const [key, value] of Object.entries(env)) {
    if (/^RESEND_TEMPLATE_.*_ID$/.test(key) && value && !templates.some(item => item.id === value)) throw new Error("Saved email template IDs belong to a different Resend account. Restore the matching credentials.");
  }
}

function existingKey(keys, type, configured) {
  const matches = keys.filter(key => key.type === type && (!configured || key.api_key === configured));
  if (configured && matches.length !== 1) throw new Error(`Configured Supabase ${type} key does not match the selected project. Restore its matching key.`);
  const defaults = matches.filter(key => key.name === "default");
  const selected = defaults.length === 1 ? defaults[0] : matches.length === 1 ? matches[0] : null;
  if (!selected && matches.length > 1) throw new Error(`Multiple Supabase ${type} keys exist. Set the intended key in .env.`);
  if (selected && !selected.api_key?.startsWith(`sb_${type}_`)) throw new Error(`Supabase did not reveal its ${type} key. Check API-key read/reveal permissions.`);
  return selected?.api_key;
}

// Account discovery precedes the existing project-level preflight. It cannot
// validate SQL/Auth on a project that does not exist, and explicitly says so.
// Existing projects only get read-only discovery here; their normal full
// preflight still gates every write, including saving discovered .env values.
export async function bootstrapSetup({ root, env: input, checkOnly = false, state = null, management, api, stripeCheck = checkBootstrapStripe, aiCheck = checkAI, choose = chooseBootstrapOption, sleep = pause, attempts = 60, log = console.log }) {
  const env = { ...input };
  env.APP_NAME ||= "Forma";
  env.APP_URL ||= "http://localhost:3000";
  const generated = () => Object.fromEntries(Object.entries(env).filter(([key, value]) => value !== input[key]));
  if ((!state || state.complete) && projectKeys.every(key => env[key]) && env.RESEND_FROM_EMAIL) return { env, generated: generated() };
  const errors = validateConfig(env, { bootstrap: true });
  const billing = JSON.parse(await readFile(join(root, "config/billing-seed.json"), "utf8")).enabled !== false;
  if (billing && !/^[sr]k_test_/.test(env.STRIPE_TEST_SECRET_KEY || "")) errors.push("Fill STRIPE_TEST_SECRET_KEY with your Stripe sandbox Secret key.");
  if (errors.length) throw new Error(errors.join("\n"));
  management ||= bootstrapManagement(env.SUPABASE_ACCESS_TOKEN);
  api ||= createApi(env);

  if (state?.project && env.SUPABASE_PROJECT_REF && state.project !== env.SUPABASE_PROJECT_REF) throw new Error("Supabase project differs from the bootstrap receipt. Restore the original project configuration.");
  env.SUPABASE_PROJECT_REF ||= state?.project || "";
  if (!env.SUPABASE_PROJECT_REF && projectKeys.slice(1).some(key => env[key])) throw new Error("Restore SUPABASE_PROJECT_REF for these existing keys. Kickstart will not create a replacement project.");
  if (!env.SUPABASE_PROJECT_REF && !state) {
    const entries = await readdir(join(root, ".kickstart")).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    const secrets = await readdir(join(root, ".secrets")).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    const savedValues = Object.entries(env).some(([key, value]) => value && /^(?:SUPABASE_EMAIL_HOOK_SECRET|RESEND_TEMPLATE_.*_ID|STRIPE_.*_(?:PRODUCT_ID_.*|WEBHOOK_SECRET))$/.test(key));
    if (entries.some(name => name !== "install.lock") || secrets.length || savedValues) throw new Error("Existing kickstart state found. Restore SUPABASE_PROJECT_REF and its receipt; no replacement project will be created.");
  }

  // Run all independent service checks to completion before any provisioning.
  const checks = await Promise.allSettled([
    management("/organizations"), management("/projects"),
    discoverSender(env, api, choose), billing ? stripeCheck(env) : Promise.resolve(null), aiCheck(env),
  ]);
  const failures = checks.filter(result => result.status === "rejected");
  if (failures.length) throw new Error(failures.map(result => result.reason.message).join("\n"));
  const [organizations, projects, , stripeAccount] = checks.map(result => result.value);
  if (!Array.isArray(organizations) || !Array.isArray(projects)) throw new Error("Unexpected Supabase account discovery response.");
  if (state && (state.stripeAccount !== stripeAccount || state.resendKeyHash !== digest(env.RESEND_API_KEY))) throw new Error("Bootstrap provider account/key changed. Restore the original credentials and saved receipt before resuming.");

  let project = env.SUPABASE_PROJECT_REF ? projects.find(item => projectRef(item) === env.SUPABASE_PROJECT_REF) : null;
  if (env.SUPABASE_PROJECT_REF && !project) throw new Error("The saved Supabase project is not accessible. Restore its management token; no replacement will be created.");
  const organization = project?.organization_slug || organizations.find(item => item.id === project?.organization_id)?.slug || env.SUPABASE_ORGANIZATION_SLUG || state?.organization || await choose("Supabase organizations", organizations.map(item => ({ label: item.name || item.slug, value: item.slug })), "SUPABASE_ORGANIZATION_SLUG");
  // A token scoped to an existing project can read that project's organization
  // identity while /organizations returns an empty list. It need not gain
  // organization-wide access just to recover its own application keys.
  if ((!project && !organizations.some(item => item.slug === organization)) || (state && state.organization !== organization) || (env.SUPABASE_ORGANIZATION_SLUG && env.SUPABASE_ORGANIZATION_SLUG !== organization)) throw new Error("The selected Supabase organization does not match accessible account/receipt settings.");
  let region = state?.region || env.SUPABASE_REGION || "us-east-1";
  if (state && env.SUPABASE_REGION && state.region !== env.SUPABASE_REGION) throw new Error("Project region differs from the saved bootstrap operation. Restore the original region.");
  if (!project && !state?.pending) {
    const regions = await management(`/projects/available-regions?organization_slug=${encodeURIComponent(organization)}`);
    const available = regions?.all?.specific;
    if (!Array.isArray(available)) throw new Error("Supabase did not return available project regions.");
    // The API omits status for available regions; capacity/other means unavailable.
    if (!env.SUPABASE_REGION && !state && !available.some(item => item.code === region && !item.status)) {
      region = available.find(item => /^us-/.test(item.code) && !item.status)?.code;
    }
    if (!available.some(item => item.code === region && !item.status)) throw new Error("The selected US/project region has no available capacity. Set SUPABASE_REGION to an available region or retry later.");
  }
  const postDiscoveryErrors = validateConfig(env, { bootstrap: true });
  if (postDiscoveryErrors.length) throw new Error(postDiscoveryErrors.join("\n"));
  log("PASS Account preflight: Supabase, Resend and enabled Stripe/AI read access checked. Project creation, key creation and other write permissions remain unverified until provisioning.");
  log(env.RESEND_TEST_MODE === "true" ? "Email: Resend test sender; delivery is limited to your Resend account email." : "Email: verified Resend sending domain selected.");

  if (!project && checkOnly) {
    log("Project-level SQL, Auth, keys, extensions and function checks are deferred until the hosted project exists. No project, keys, files or settings were created by this check.");
    return { env, generated: {}, checked: true };
  }
  const statePath = join(root, ".kickstart/bootstrap.json");
  if (!project) {
    if (!state) {
      state = { version: 1, organization, region, stripeAccount, resendKeyHash: digest(env.RESEND_API_KEY), name: `${env.APP_NAME.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 40)}-${randomBytes(8).toString("hex")}`, pending: false };
      await saveJson(statePath, state);
    }
    if (state.pending) {
      const matches = projects.filter(item => item.name === state.name && (item.organization_slug === organization || organizations.find(org => org.id === item.organization_id)?.slug === organization));
      if (matches.length !== 1) throw new Error("Project creation is unresolved. Check Supabase for the exact project name in .kickstart/bootstrap.json, then rerun once visible. No second create request will be issued; see docs/KICKSTART.md for recovery.");
      project = matches[0];
    } else {
      if (projects.some(item => item.name === state.name)) throw new Error("The reserved project name already exists. Reconcile the bootstrap receipt before continuing.");
      // The password is generated once and kept only in ignored local recovery
      // state. It is never required for migrations or copied into runtime envs.
      const password = randomBytes(36).toString("base64url");
      await saveJson(join(root, ".secrets/supabase-bootstrap.json"), { organization, name: state.name, databasePassword: password });
      state.pending = true;
      await saveJson(statePath, state);
      log(`Creating the hosted Supabase project in ${region}.`);
      try {
        project = await management("/projects", { organization_slug: organization, name: state.name, db_pass: password, region_selection: { type: "specific", code: region } });
      } catch (error) {
        if (error.definitelyRejected) { state.pending = false; await saveJson(statePath, state); }
        throw error;
      }
    }
    if (!refPattern.test(projectRef(project) || "")) throw new Error("Supabase did not return a valid project reference. Rerun to reconcile creation.");
    state.project = projectRef(project);
    await saveJson(statePath, state);
    env.SUPABASE_PROJECT_REF = projectRef(project);
  }
  const ref = env.SUPABASE_PROJECT_REF;
  if (state?.project === ref) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      project = await management(`/projects/${ref}`);
      if (projectRef(project) !== ref) throw new Error("Supabase returned a different project identity.");
      if (project.status === "ACTIVE_HEALTHY") break;
      if (checkOnly || attempt === attempts - 1) throw new Error("The saved project is still starting. Rerun kickstart when healthy; its receipt prevents duplicate creation.");
      if (attempt % 6 === 0) log("Waiting for the saved Supabase project to become healthy...");
      await sleep(5000);
    }
  }
  env.NEXT_PUBLIC_SUPABASE_URL ||= `https://${ref}.supabase.co`;
  let keys = await management(`/projects/${ref}/api-keys?reveal=true`);
  if (!Array.isArray(keys)) throw new Error("Unexpected Supabase API-key response.");
  for (const [type, key] of [["publishable", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"], ["secret", "SUPABASE_SECRET_KEY"]]) {
    let value = existingKey(keys, type, env[key]);
    if (!value) {
      if (checkOnly) {
        log(`Supabase ${type} key creation is deferred until provisioning. No changes made.`);
        return { env, generated: {}, checked: true };
      }
      if (state?.project !== ref) throw new Error(`Create a ${type} API key in the existing project's API Keys settings, then rerun. Existing projects are not modified during discovery.`);
      state.pendingKeys ||= {};
      if (state.pendingKeys[type]) throw new Error(`Supabase ${type} key creation is unresolved. Restore key visibility/permissions and rerun; no duplicate key will be created.`);
      state.pendingKeys[type] = true;
      await saveJson(statePath, state);
      try {
        await management(`/projects/${ref}/api-keys?reveal=true`, { type, name: "default", ...(type === "secret" ? { secret_jwt_template: { role: "service_role" } } : {}) });
      } catch (error) {
        if (error.definitelyRejected) { delete state.pendingKeys[type]; await saveJson(statePath, state); }
        throw error;
      }
      keys = await management(`/projects/${ref}/api-keys?reveal=true`);
      value = existingKey(keys, type);
      if (!value) throw new Error("The newly created API key is not visible yet. Rerun to reconcile it.");
    }
    env[key] = value;
  }
  return { env, generated: generated(), created: !!state?.project };
}
