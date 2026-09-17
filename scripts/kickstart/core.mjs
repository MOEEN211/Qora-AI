import { createHash } from "node:crypto";
import { testEmailDeploymentAllowed } from "./environment.mjs";

export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const sqlString = (value) => "'" + value.replaceAll("'", "''") + "'";

// Supabase secret updates can advance deployment versions without changing code.
// A version increase is safe only with the same previously verified bundle hash.
export function functionReceipt(fn) {
  return { slug: fn.slug, version: fn.version, ...(/^[a-f0-9]{64}$/.test(fn.ezbr_sha256 || "") ? { bundleSha256: fn.ezbr_sha256 } : {}) };
}
export function matchesFunctionReceipt(fn, receipt) {
  if (!receipt || receipt.slug !== fn.slug || fn.verify_jwt !== false || fn.status !== "ACTIVE") return false;
  if (receipt.bundleSha256 && receipt.bundleSha256 !== fn.ezbr_sha256) return false;
  return receipt.version === fn.version || (Number.isInteger(fn.version) && fn.version > receipt.version && /^[a-f0-9]{64}$/.test(receipt.bundleSha256 || "") && receipt.bundleSha256 === fn.ezbr_sha256);
}

export async function checkSender(env, api) {
  const domains = await api.domains(); // Always verify API access, including test mode.
  if (env.RESEND_TEST_MODE === "true") {
    if (env.RESEND_FROM_EMAIL !== "onboarding@resend.dev") throw new Error("Resend test mode requires onboarding@resend.dev.");
    return "Resend test sender enabled. Delivery is limited to the Resend account email.";
  }
  const domain = env.RESEND_FROM_EMAIL.split("@")[1].toLowerCase();
  if (!domains.some(item => item.name.toLowerCase() === domain && item.status === "verified")) throw new Error("The exact sender domain is not verified in this Resend account. Verify its DNS records first.");
  return "Verified sending domain found.";
}

export function validateConfig(env, { bootstrap = false } = {}) {
  const required = ["APP_URL", "APP_NAME", "SUPABASE_ACCESS_TOKEN", "RESEND_API_KEY", ...(bootstrap ? [] : ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PROJECT_REF", "SUPABASE_SECRET_KEY", "RESEND_FROM_EMAIL"])];
  const errors = required.filter(key => !env[key]?.trim()).map(key => `${key} is missing. Fill it in .env.`);
  if (!["true", "false"].includes(env.RESEND_TEST_MODE || "false")) errors.push("RESEND_TEST_MODE must be true or false.");
  if (!["true", "false"].includes(env.RESEND_ALLOW_TEST_DEPLOYMENT || "false")) errors.push("RESEND_ALLOW_TEST_DEPLOYMENT must be true or false.");
  if (env.RESEND_FROM_EMAIL === "onboarding@resend.dev" && env.RESEND_TEST_MODE !== "true") errors.push("Set RESEND_TEST_MODE=true to explicitly use the restricted Resend test sender.");
  if (env.RESEND_TEST_MODE === "true") {
    if ((!bootstrap || env.RESEND_FROM_EMAIL) && env.RESEND_FROM_EMAIL !== "onboarding@resend.dev") errors.push("RESEND_TEST_MODE requires RESEND_FROM_EMAIL=onboarding@resend.dev.");
    try { if (!["localhost", "127.0.0.1"].includes(new URL(env.APP_URL).hostname) && !testEmailDeploymentAllowed(env)) errors.push("Resend test mode needs a local APP_URL or explicit RESEND_ALLOW_TEST_DEPLOYMENT=true for temporary account-only email testing."); } catch { /* APP_URL validation below reports this. */ }
  }
  if (env.SUPABASE_PROJECT_REF && !/^[a-z0-9]{20}$/.test(env.SUPABASE_PROJECT_REF)) errors.push("SUPABASE_PROJECT_REF must identify a hosted Supabase project.");
  if ((!bootstrap || env.NEXT_PUBLIC_SUPABASE_URL) && env.NEXT_PUBLIC_SUPABASE_URL !== `https://${env.SUPABASE_PROJECT_REF}.supabase.co`) errors.push("NEXT_PUBLIC_SUPABASE_URL must match the hosted SUPABASE_PROJECT_REF (https://<ref>.supabase.co).");
  if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) errors.push("Use a Supabase publishable key, never a secret/service-role key, for the browser.");
  if (env.SUPABASE_SECRET_KEY && !env.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) errors.push("SUPABASE_SECRET_KEY must be a server-only secret key from this project's API Keys settings.");
  try {
    const url = new URL(env.APP_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error();
  } catch { errors.push("APP_URL must be an HTTPS origin or an HTTP localhost origin, with no path or credentials."); }
  if (env.RESEND_FROM_EMAIL && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.RESEND_FROM_EMAIL)) errors.push("RESEND_FROM_EMAIL must be a sender address on your verified Resend domain.");
  if (!["true", "false", "yes", "no"].includes(env.AUTH_EMAIL_VERIFICATION || "false")) errors.push("AUTH_EMAIL_VERIFICATION must be true/false or yes/no (default false).");
  if (env.APP_NAME && (env.APP_NAME.length > 80 || /[\r\n]/.test(env.APP_NAME))) errors.push("APP_NAME must be a single line of at most 80 characters.");
  if (env.SUPABASE_EMAIL_HOOK_SECRET && !/^v1,whsec_[A-Za-z0-9+/]{43}=$/.test(env.SUPABASE_EMAIL_HOOK_SECRET)) errors.push("SUPABASE_EMAIL_HOOK_SECRET must be the generated signing secret; leave it empty on first setup.");
  return errors;
}

export function createApi(env, fetcher = fetch) {
  async function request(url, token, options = {}) {
    let response;
    try { response = await fetcher(url, { ...options, headers: { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), Authorization: `Bearer ${token}`, ...options.headers }, signal: AbortSignal.timeout(options.body instanceof FormData ? 60000 : 20000) }); }
    catch { throw new Error("Connection failed or timed out. Check connectivity and try again."); }
    // Never surface provider response bodies: they can contain secrets or SQL literals.
    if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}. Check the credential's validity, permissions, and target.`);
    // Some successful Management API writes return 200/201 with no body.
    const body = await response.text();
    if (!body.trim()) return null;
    try { return JSON.parse(body); }
    catch { throw new Error("Provider returned an unreadable response. Rerun to verify the completed operation."); }
  }
  const management = (path, options) => request(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}${path}`, env.SUPABASE_ACCESS_TOKEN, options);
  // Serialize requests within this installer to respect Resend's account rate limit.
  let resendQueue = Promise.resolve(), lastResend = 0;
  const resend = (path, options) => {
    const next = resendQueue.then(async () => {
      const delay = Math.max(0, 600 - (Date.now() - lastResend));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      lastResend = Date.now();
      return request(`https://api.resend.com${path}`, env.RESEND_API_KEY, options);
    });
    resendQueue = next.catch(() => {});
    return next;
  };
  const resendList = async path => {
    const items = [];
    let cursor;
    do {
      const page = await resend(`${path}?limit=100${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`);
      if (!Array.isArray(page.data)) throw new Error("Unexpected Resend list response.");
      items.push(...page.data);
      const next = page.has_more ? page.data.at(-1)?.id : undefined;
      if (page.has_more && (!next || next === cursor)) throw new Error("Resend pagination did not advance.");
      cursor = next;
    } while (cursor);
    return items;
  };
  return {
    management,
    resend, resendList,
    query: (query, readOnly = true) => management("/database/query", { method: "POST", body: JSON.stringify({ query, read_only: readOnly }) }),
    authSettings: () => request(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } }),
    checkServerKey: async () => {
      await request(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, env.SUPABASE_SECRET_KEY, { headers: { apikey: env.SUPABASE_SECRET_KEY } });
      return "Server-only Auth access verified. No users changed.";
    },
    domains: () => resendList("/domains"),
  };
}

export async function runPreflight(env, probes) {
  const invalid = validateConfig(env);
  if (invalid.length) return { ok: false, results: invalid.map(message => ({ name: "Configuration", ok: false, message })) };
  const results = await Promise.all(probes.map(async ({ name, run }) => {
    try { return { name, ok: true, value: await run() }; }
    catch (error) { return { name, ok: false, message: error.message }; }
  }));
  return { ok: results.every(result => result.ok), results };
}

export async function executeSetup({ env, probes, steps, checkOnly = false, log = () => {} }) {
  const preflight = await runPreflight(env, probes);
  preflight.results.forEach(log);
  if (!preflight.ok) return { status: "blocked", preflight, completed: [] };
  if (checkOnly) return { status: "checked", preflight, completed: [] };
  const completed = [];
  for (const step of steps) {
    try { await step.run(); completed.push(step.name); log({ name: step.name, ok: true }); }
    catch (error) { return { status: "partial", preflight, completed, failed: step.name, message: error.message }; }
  }
  return { status: "complete", preflight, completed };
}

export function migrationQuery(version, sql) {
  const checksum = digest(sql);
  return `begin;
select pg_advisory_xact_lock(hashtext('forma-kickstart'));
create schema if not exists private;
revoke all on schema private from public, anon;
create table if not exists private.kickstart_migrations(version text primary key, checksum text not null, applied_at timestamptz not null default now());
revoke all on private.kickstart_migrations from public, anon, authenticated;
do $kickstart$
begin
  if exists(select 1 from private.kickstart_migrations where version = ${sqlString(version)} and checksum <> ${sqlString(checksum)}) then
    raise exception 'An applied migration has changed. Restore the original and add a new migration.';
  end if;
  if not exists(select 1 from private.kickstart_migrations where version = ${sqlString(version)}) then
    ${sql}
    insert into private.kickstart_migrations(version, checksum) values (${sqlString(version)}, ${sqlString(checksum)});
  end if;
end;
$kickstart$;
commit;`;
}
