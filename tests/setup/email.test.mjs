import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { Webhook } from "standardwebhooks";
import { updateEnvText } from "../../scripts/kickstart/env-file.mjs";
import { loadTemplates, inspectTemplates, publishTemplate } from "../../scripts/kickstart/templates.mjs";
import { createEmailHook, buildAuthMessage } from "../../supabase/functions/send-auth-email/handler.mjs";
import { deliverWelcome as sendWelcome } from "../../lib/email/welcome.mjs";
const deliverWelcome = (user, env, fetcher) => sendWelcome(user,
  {...env,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'fake-server-key'},
  (url,options)=>String(url).endsWith('/rpc/email_notifications_allowed') ? Promise.resolve(Response.json(true)) : fetcher(url,options));
import { verificationEnabled } from "../../lib/email/verification.mjs";
import { validateConfig } from "../../scripts/kickstart/core.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const config = { APP_NAME: "Test & Co", APP_URL: "http://127.0.0.1:3000", RESEND_FROM_EMAIL: "hello@example.com", RESEND_API_KEY: "fake-key", SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst" };
const edgeEnv = { FORMA_APP_URL: config.APP_URL, FORMA_RESEND_FROM_EMAIL: config.RESEND_FROM_EMAIL, FORMA_RESEND_API_KEY: "fake-key", FORMA_RESEND_TEMPLATE_VERIFICATION_ID: "verification-id", FORMA_RESEND_TEMPLATE_PASSWORD_RESET_ID: "reset-id" };
const payload = { user: { id: "user-id", email: "user@example.com" }, email_data: { email_action_type: "signup", token_hash: "token-to-verify", redirect_to: "https://attacker.example" } };
const secret = randomBytes(32).toString("base64");
const webhook = new Webhook(secret);
function signedRequest(value = payload, date = new Date(), tamper = false) {
  const body = JSON.stringify(value), id = "hook-event-1";
  return new Request("https://project.supabase.co/functions/v1/email", { method: "POST", body: tamper ? body.replace("user@example.com", "attacker@example.com") : body,
    headers: { "webhook-id": id, "webhook-timestamp": String(Math.floor(date.getTime() / 1000)), "webhook-signature": webhook.sign(id, date, body) } });
}

test("verification is off by default; true/yes enable it and invalid values fail config", () => {
  assert.equal(verificationEnabled(undefined), false);
  assert.equal(verificationEnabled("false"), false); assert.equal(verificationEnabled("no"), false);
  assert.equal(verificationEnabled("true"), true); assert.equal(verificationEnabled("yes"), true);
  assert.ok(validateConfig({ AUTH_EMAIL_VERIFICATION: "maybe" }).some(error => error.includes("AUTH_EMAIL_VERIFICATION")));
});
test("generated env IDs preserve credentials, saved URLs, comments, and newline style", () => {
  const input = '# My keys\r\nSECRET="abc#123"\r\nAPP_URL_DEV=http://127.0.0.1:3000\r\nAPP_URL_LIVE=\r\nRESEND_TEMPLATE_WELCOME_ID= # generated\r\n';
  const updated = updateEnvText(input, { RESEND_TEMPLATE_WELCOME_ID: "id-123", SUPABASE_EMAIL_HOOK_SECRET: `v1,whsec_${secret}` });
  assert.equal(parseEnv(updated).SECRET, "abc#123");
  assert.equal(parseEnv(updated).APP_URL_DEV, "http://127.0.0.1:3000");
  assert.equal(parseEnv(updated).APP_URL_LIVE, "");
  assert.equal(parseEnv(updated).RESEND_TEMPLATE_WELCOME_ID, "id-123");
  assert.ok(updated.startsWith("# My keys\r\n")); assert.ok(!/(?<!\r)\n/.test(updated));
  assert.equal(updateEnvText(updated, { RESEND_TEMPLATE_WELCOME_ID: "id-123" }), updated);
  assert.throws(() => updateEnvText("X=1\nX=2", { X: "3" }), /Duplicate/);
  assert.throws(() => updateEnvText("", { X: "id\nINJECTED=yes" }), /Unsafe/);
});

function fakeResend() {
  const records = [], writes = [];
  let loseCreateResponse = false;
  return {
    records, writes, loseNextCreate() { loseCreateResponse = true; },
    async resendList() { return records.map(item => ({ id: item.id, alias: item.alias })); },
    async resend(path, options = {}) {
      if (options.method === "POST" && path === "/templates") {
        const record = { ...JSON.parse(options.body), id: `id-${records.length + 1}`, status: "draft", has_unpublished_versions: true };
        records.push(record); writes.push("create");
        if (loseCreateResponse) { loseCreateResponse = false; throw new Error("Lost response"); }
        return { id: record.id };
      }
      const record = records.find(item => path.split("/")[2] === item.id);
      if (path.endsWith("/publish")) { writes.push("publish"); record.status = "published"; record.has_unpublished_versions = false; }
      return structuredClone(record);
    },
  };
}
test("five source templates escape branding and use project/content-scoped aliases", async () => {
  const templates = await loadTemplates(root, config);
  assert.equal(templates.length, 5);
  for (const item of templates) {
    assert.match(item.payload.html, /Test &amp; Co/); assert.match(item.payload.html, /\{\{\{ACTION_URL\}\}\}/);
    assert.ok(item.payload.alias.includes(config.SUPABASE_PROJECT_REF));
    assert.ok(item.payload.alias.length <= 50, "Resend aliases must fit its 50-character limit");
  }
  const changed = await loadTemplates(root, { ...config, APP_NAME: "Changed" });
  assert.notEqual(templates[0].payload.alias, changed[0].payload.alias);
});
test("publishing twice reuses the template and saves only a verified published ID", async () => {
  const api = fakeResend(), [template] = await loadTemplates(root, config), saved = [];
  await publishTemplate(api, template, async (key, id) => saved.push({ key, id }));
  await publishTemplate(api, template, async (key, id) => saved.push({ key, id }));
  assert.deepEqual(api.writes, ["create", "publish"]); assert.equal(saved.length, 2); assert.deepEqual(saved[0], saved[1]);
});
test("a lost create response resumes by alias with no duplicate resource", async () => {
  const api = fakeResend(), [template] = await loadTemplates(root, config);
  api.loseNextCreate();
  await assert.rejects(publishTemplate(api, template, async () => {}), /Lost response/);
  await publishTemplate(api, template, async () => {});
  assert.deepEqual(api.writes, ["create", "publish"]); assert.equal(api.records.length, 1);
});
test("template drift and a different Resend account stop before template writes", async () => {
  const api = fakeResend(), templates = await loadTemplates(root, config);
  await publishTemplate(api, templates[0], async () => {});
  api.records[0].html = "Buyer edit";
  await assert.rejects(inspectTemplates(api, templates, {}), /edited outside/);
  await assert.rejects(publishTemplate(api, templates[0], async () => {}), /edited outside/);
  await assert.rejects(inspectTemplates(fakeResend(), templates, { RESEND_TEMPLATE_WELCOME_ID: "other-account-id" }), /does not exist/);
  assert.deepEqual(api.writes, ["create", "publish"]);
});
test("local env write failure resumes without creating or publishing again", async () => {
  const api = fakeResend(), [template] = await loadTemplates(root, config);
  await assert.rejects(publishTemplate(api, template, async () => { throw new Error("Disk full"); }), /Disk full/);
  await publishTemplate(api, template, async () => {});
  assert.deepEqual(api.writes, ["create", "publish"]);
});

test("signed signup and recovery hooks choose the right published template and trusted URL", async () => {
  const calls = [];
  const hook = createEmailHook({ env: edgeEnv, verify: (body, headers) => webhook.verify(body, headers), fetcher: async (_, options) => { calls.push(options); return Response.json({ id: "sent-id" }); } });
  assert.equal((await hook(signedRequest())).status, 200);
  assert.equal((await hook(signedRequest({ ...payload, email_data: { ...payload.email_data, email_action_type: "recovery" } }))).status, 200);
  const first = JSON.parse(calls[0].body), second = JSON.parse(calls[1].body);
  assert.equal(first.template.id, "verification-id"); assert.equal(second.template.id, "reset-id");
  assert.ok(first.template.variables.ACTION_URL.startsWith(config.APP_URL));
  assert.equal(new URL(second.template.variables.ACTION_URL).searchParams.get("type"), "recovery");
  assert.ok(!calls[0].headers["Idempotency-Key"].includes(payload.email_data.token_hash));
  assert.notEqual(calls[0].headers["Idempotency-Key"], calls[1].headers["Idempotency-Key"]);
});
test("forged, missing, stale signatures and unsupported email types never send", async () => {
  let sends = 0;
  const hook = createEmailHook({ env: edgeEnv, verify: (body, headers) => webhook.verify(body, headers), fetcher: async () => { sends++; return Response.json({ id: "bad" }); } });
  assert.equal((await hook(signedRequest(payload, new Date(), true))).status, 401);
  assert.equal((await hook(signedRequest(payload, new Date(Date.now() - 600000)))).status, 401);
  assert.equal((await hook(new Request("https://example.com", { method: "POST", body: JSON.stringify(payload) }))).status, 401);
  assert.equal((await hook(signedRequest({ ...payload, email_data: { ...payload.email_data, email_action_type: "email_change" } }))).status, 500);
  assert.equal(sends, 0);
  assert.throws(() => buildAuthMessage({ ...payload, email_data: {} }, edgeEnv), /Unsupported/);
});
test("hook retries have identical idempotency keys; provider errors are redacted", async () => {
  const calls = [];
  const hook = createEmailHook({ env: edgeEnv, verify: (body, headers) => webhook.verify(body, headers), fetcher: async (_, options) => { calls.push(options.headers["Idempotency-Key"]); return Response.json({ error: "private provider payload" }, { status: 403 }); } });
  const response = await hook(signedRequest());
  assert.equal(response.status, 500); assert.ok(!(await response.text()).includes("private provider"));
  await hook(signedRequest()); assert.equal(calls[0], calls[1]);
});
test("welcome waits for confirmation; verified signup and confirmation can send with deduplication", async () => {
  let sends = 0;
  const calls = [];
  const env = { ...config, RESEND_TEMPLATE_WELCOME_ID: "welcome-id" };
  const fetcher = async (_, options) => { sends++; calls.push(options); return Response.json({ id: "sent-id" }); };
  assert.equal(await deliverWelcome(payload.user, env, fetcher), false); assert.equal(sends, 0);
  const confirmed = { ...payload.user, email_confirmed_at: new Date().toISOString() };
  assert.equal(await deliverWelcome(confirmed, env, fetcher), true);
  assert.equal(JSON.parse(calls[0].body).template.id, "welcome-id");
  assert.equal(calls[0].headers["Idempotency-Key"], `welcome-${payload.user.id}`);
});
test("transient welcome failures retry the same message; permanent errors do not retry", async () => {
  const env = { ...config, RESEND_TEMPLATE_WELCOME_ID: "welcome-id" }, calls = [];
  const user = { ...payload.user, email_confirmed_at: "2026-09-13" };
  assert.equal(await deliverWelcome(user, env, async (_, options) => {
    calls.push(options); return calls.length === 1 ? new Response(null, { status: 429 }) : Response.json({ id: "sent" });
  }), true);
  assert.equal(calls[0].headers["Idempotency-Key"], calls[1].headers["Idempotency-Key"]);
  assert.equal(calls[0].body, calls[1].body);
  let permanentCalls = 0;
  assert.equal(await deliverWelcome(user, env, async () => { permanentCalls++; return new Response(null, { status: 403 }); }), false);
  assert.equal(permanentCalls, 1);
});
