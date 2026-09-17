import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify, parseEnv } from "node:util";
const exec = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const fixture = new URL("provider-fixture.mjs", import.meta.url).href;
async function project() {
  const path = await mkdtemp(join(tmpdir(), "forma-email-test-"));
  for (const name of ["scripts/kickstart", "config/integrations.json", "config/billing-seed.json", "lib/email/verification.mjs", "lib/ai/config.mjs", "supabase/functions/send-auth-email", "supabase/migrations", "emails"]) {
    await mkdir(dirname(join(path, name)), { recursive: true });
    await cp(join(root, name), join(path, name), { recursive: true });
  }
  await writeFile(join(path, "package.json"), '{"type":"module"}');
  const source = await readFile(join(root, ".env.example"), "utf8");
  const values = { APP_URL: "http://127.0.0.1:3000", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake", SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_SECRET_KEY: "sb_secret_fake", SUPABASE_ACCESS_TOKEN: "fake-management", RESEND_API_KEY: "fake-resend", RESEND_FROM_EMAIL: "hello@example.com" };
  let env = source;
  for (const [key, value] of Object.entries(values)) env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  await writeFile(join(path, "config/billing-seed.json"), JSON.stringify({ enabled: false }));
  await writeFile(join(path, ".env"), env);
  return path;
}
async function run(path, args = [], overrides = {}) {
  try {
    const result = await exec(process.execPath, ["--import", fixture, "scripts/kickstart/index.mjs", ...args], { cwd: path, env: { ...process.env, FAKE_PROVIDER_STATE: join(path, "provider-state.json"), ...overrides }, timeout: 30000 });
    return { code: 0, output: result.stdout + result.stderr };
  } catch (error) { return { code: error.code, output: (error.stdout || "") + (error.stderr || "") }; }
}
const stateOf = async path => JSON.parse(await readFile(join(path, "provider-state.json"), "utf8"));
async function cleanup(path) {
  const target = resolve(path);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith("forma-email-test-"));
  await rm(target, { recursive: true, force: true });
}

test("actual CLI checks without writes, provisions both verification modes, and reruns without duplicate templates/functions", async () => {
  const path = await project();
  try {
    const before = await readFile(join(path, ".env"), "utf8");
    let result = await run(path, ["--check"]);
    assert.equal(result.code, 0, result.output); assert.deepEqual((await stateOf(path)).mutations, []);
    assert.equal(await readFile(join(path, ".env"), "utf8"), before);
    // Exercise the real deploy CLI composition, with billing disabled. Missing
    // deployment credentials must block even though all core provider reads pass.
    await writeFile(join(path, ".env"), before.replace(/^APP_URL_LIVE=.*$/m, "APP_URL_LIVE=https://example.com"));
    result = await run(path, ["--deploy"]);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Fill deployment fields/);
    assert.deepEqual((await stateOf(path)).mutations, []);
    await writeFile(join(path, ".env"), before);
    result = await run(path); assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Migration \d{14}_account_onboarding.sql/);
    assert.match(result.output, /PASS Verify onboarding storage/);
    const env = parseEnv(await readFile(join(path, ".env"), "utf8"));
    assert.ok(env.RESEND_TEMPLATE_MAGIC_LINK_ID); assert.ok(env.RESEND_TEMPLATE_WELCOME_ID); assert.ok(env.RESEND_TEMPLATE_VERIFICATION_ID); assert.ok(env.RESEND_TEMPLATE_PASSWORD_RESET_ID);
    assert.match(env.SUPABASE_EMAIL_HOOK_SECRET, /^v1,whsec_/);
    let state = await stateOf(path);
    assert.equal(state.auth.external_google_enabled, true); assert.equal(state.auth.external_google_client_id, "dashboard-client"); assert.equal(state.auth.external_google_secret, "dashboard-secret");
    assert.ok(!state.secrets.some(item => /GOOGLE/.test(item.name)));
    assert.ok(state.auth.uri_allow_list.includes("/auth/callback"));
    assert.equal(state.auth.mailer_autoconfirm, true); assert.equal(state.auth.hook_send_email_enabled, true);
    assert.equal(state.functions[0].verify_jwt, false);
    assert.ok(state.secrets.every(item => item.name.startsWith("FORMA_")));
    assert.ok(!state.secrets.some(item => item.name.includes("ACCESS_TOKEN")));
    result = await run(path); assert.equal(result.code, 0, result.output);
    state = await stateOf(path); assert.equal(state.templates.length, 5); assert.equal(state.functions.length, 1);
    assert.equal(state.mutations.filter(item => item === "create-template").length, 5);
    await writeFile(join(path, ".env"), (await readFile(join(path, ".env"), "utf8")).replace("AUTH_EMAIL_VERIFICATION=false", "AUTH_EMAIL_VERIFICATION=yes"));
    result = await run(path); assert.equal(result.code, 0, result.output);
    assert.equal((await stateOf(path)).auth.mailer_autoconfirm, false);
    const prior = (await stateOf(path)).mutations.length;
    result = await run(path, [], { FAKE_REJECT_SERVER_KEY: "yes" }); assert.equal(result.code, 1, result.output);
    assert.equal((await stateOf(path)).mutations.length, prior);
    result = await run(path, [], { FAKE_REJECT_KEY: "yes" }); assert.equal(result.code, 1, result.output);
    assert.equal((await stateOf(path)).mutations.length, prior);
  } finally { await cleanup(path); }
});
test("actual CLI resumes a lost template response without duplicating or migrating early", async () => {
  const path = await project();
  try {
    let result = await run(path, [], { FAKE_LOSE_RESPONSE: "yes" });
    assert.equal(result.code, 1, result.output);
    assert.deepEqual((await stateOf(path)).mutations, ["create-template"]);
    result = await run(path); assert.equal(result.code, 0, result.output);
    const state = await stateOf(path);
    assert.equal(state.templates.length, 5);
    assert.equal(state.mutations.filter(item => item === "create-template").length, 5);
  } finally { await cleanup(path); }
});

test("actual CLI bootstraps a new project then installs auth, email and schema with no manual project values", async () => {
  const path = await project();
  try {
    // Billing has its independent fixture suite; this CLI fixture disables it.
    await writeFile(join(path, ".env"), "SUPABASE_ACCESS_TOKEN=fake-management\nRESEND_API_KEY=fake-resend\n");
    const overrides = { FAKE_BOOTSTRAP: "yes" };
    let result = await run(path, ["--check"], overrides);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /deferred/);
    assert.deepEqual((await stateOf(path)).mutations, []);
    await assert.rejects(readFile(join(path, ".kickstart/bootstrap.json")), { code: "ENOENT" });
    result = await run(path, [], overrides);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Configuration verified/);
    const env = parseEnv(await readFile(join(path, ".env"), "utf8"));
    assert.equal(env.SUPABASE_PROJECT_REF, "abcdefghijklmnopqrst");
    assert.equal(env.RESEND_FROM_EMAIL, "noreply@example.com");
    assert.equal(env.RESEND_TEST_MODE, "false");
    assert.ok(env.SUPABASE_EMAIL_HOOK_SECRET);
    assert.ok(env.RESEND_TEMPLATE_MAGIC_LINK_ID);
    const state = await stateOf(path);
    assert.equal(state.bootstrapProject.region, "us-east-1");
    assert.equal(state.templates.length, 5);
    assert.equal(state.ledger, true);
    result = await run(path, [], overrides);
    assert.equal(result.code, 0, result.output);
    const retried = await stateOf(path);
    assert.equal(retried.mutations.filter(item => item === "create-project").length, 1);
    assert.equal(retried.templates.length, 5);
  } finally { await cleanup(path); }
});

