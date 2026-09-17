import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig, executeSetup, migrationQuery, createApi, checkSender } from "../../scripts/kickstart/core.mjs";

const env = { APP_URL: "http://localhost:3000", APP_NAME: "Test", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", SUPABASE_SECRET_KEY: "sb_secret_fake", SUPABASE_ACCESS_TOKEN: "fake-management-token", RESEND_API_KEY: "fake-resend-key", RESEND_FROM_EMAIL: "hello@example.com" };
test("successful provider writes may have an empty 201 response", async () => {
  const api = createApi(env, async () => new Response(null, { status: 201 }));
  assert.equal(await api.management("/secrets", { method: "POST", body: "[]" }), null);
});
test("Resend test sender requires explicit local test mode and still verifies the key", async () => {
  const config = { ...env, RESEND_FROM_EMAIL: "onboarding@resend.dev", RESEND_TEST_MODE: "true" };
  assert.deepEqual(validateConfig(config), []);
  assert.ok(validateConfig({ ...config, RESEND_TEST_MODE: "false" }).length);
  assert.ok(validateConfig({ ...config, APP_URL: "https://example.com" }).length);
  assert.ok(validateConfig({ ...config, RESEND_FROM_EMAIL: "other@resend.dev" }).length);
  let checked = false;
  await checkSender(config, { domains: async () => { checked = true; return []; } });
  assert.equal(checked, true);
  await assert.rejects(checkSender(config, { domains: async () => { throw new Error("Invalid key"); } }), /Invalid key/);
  await assert.rejects(checkSender(env, { domains: async () => [] }), /not verified/);
});
test("missing credentials stop before probes or writes", async () => {
  let called = false;
  const result = await executeSetup({ env: {}, probes: [{ name: "probe", run: () => { called = true; } }], steps: [{ name: "write", run: () => { called = true; } }] });
  assert.equal(result.status, "blocked"); assert.equal(called, false);
});

test("temporary hosted test email requires explicit opt-in and retains sender and HTTPS validation", () => {
  const temporary = { ...env, APP_URL: "https://example.com", RESEND_FROM_EMAIL: "onboarding@resend.dev", RESEND_TEST_MODE: "true", RESEND_ALLOW_TEST_DEPLOYMENT: "true" };
  assert.deepEqual(validateConfig(temporary), []);
  assert.ok(validateConfig({ ...temporary, RESEND_ALLOW_TEST_DEPLOYMENT: "false" }).length);
  assert.ok(validateConfig({ ...temporary, RESEND_ALLOW_TEST_DEPLOYMENT: "yes" }).length);
  assert.ok(validateConfig({ ...temporary, RESEND_FROM_EMAIL: "wrong@resend.dev" }).length);
  assert.ok(validateConfig({ ...temporary, APP_URL: "http://example.com" }).length);
});
test("checks ALL services; rejected last service prevents every mutation", async () => {
  const events = [];
  const result = await executeSetup({ env, probes: [{ name: "database", run: async () => events.push("database checked") }, { name: "email", run: async () => { events.push("email checked"); throw new Error("Invalid key"); } }], steps: [{ name: "migrate", run: () => events.push("write") }] });
  assert.equal(result.status, "blocked"); assert.deepEqual(events, ["database checked", "email checked"]);
});
test("check-only never provisions even when credentials pass", async () => {
  let writes = 0;
  const result = await executeSetup({ env, probes: [{ name: "ok", run: async () => true }], steps: [{ name: "write", run: () => writes++ }], checkOnly: true });
  assert.equal(result.status, "checked"); assert.equal(writes, 0);
});
test("partial failure stops dependent steps and reports completed work", async () => {
  const events = [];
  const result = await executeSetup({ env, probes: [{ name: "ok", run: async () => true }], steps: [{ name: "schema", run: () => events.push("schema") }, { name: "email", run: () => { throw new Error("Network timeout"); } }, { name: "verify", run: () => events.push("verify") }] });
  assert.equal(result.status, "partial"); assert.deepEqual(result.completed, ["schema"]); assert.deepEqual(events, ["schema"]);
});
test("credential rejection is redacted and never includes provider response", async () => {
  const api = createApi(env, async () => new Response(JSON.stringify({ error: env.SUPABASE_ACCESS_TOKEN }), { status: 401 }));
  await assert.rejects(api.management(""), error => !error.message.includes(env.SUPABASE_ACCESS_TOKEN) && error.message.includes("401"));
});
test("target mismatch, service keys in browser, and unsafe app URLs are rejected", () => {
  assert.equal(validateConfig(env).length, 0);
  assert.ok(validateConfig({ ...env, NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" }).length);
  assert.ok(validateConfig({ ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_bad" }).length);
  assert.ok(validateConfig({ ...env, APP_URL: "https://example.com/path" }).length);
});
test("migration wrapper is atomic, serialized, checksum checked, and safely quotes names", () => {
  const query = migrationQuery("test'file", "select 1;");
  assert.match(query, /^begin;/); assert.match(query, /pg_advisory_xact_lock/);
  assert.match(query, /checksum <>/); assert.match(query, /if not exists/);
  assert.match(query, /test''file/); assert.match(query, /commit;$/);
});

