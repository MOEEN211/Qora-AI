import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthMessage, createEmailHook } from "../../supabase/functions/send-auth-email/handler.mjs";

const env = {
  FORMA_APP_URL: "http://127.0.0.1:3000", FORMA_RESEND_FROM_EMAIL: "hello@example.com",
  FORMA_RESEND_TEMPLATE_MAGIC_LINK_ID: "magic", FORMA_RESEND_TEMPLATE_VERIFICATION_ID: "verify",
  FORMA_RESEND_TEMPLATE_PASSWORD_RESET_ID: "reset", FORMA_RESEND_API_KEY: "fake",
};
const payload = action => ({ user: { id: "user", email: "user@example.invalid" }, email_data: { email_action_type: action, token_hash: "hash", redirect_to: `${env.FORMA_APP_URL}/auth/confirm?flow=magic` } });

test("first-time passwordless signup and returning magic links select the same template", () => {
  for (const action of ["signup", "magiclink"]) {
    const message = buildAuthMessage(payload(action), env);
    assert.equal(message.template.id, "magic");
    const url = new URL(message.template.variables.ACTION_URL);
    assert.equal(url.origin, env.FORMA_APP_URL);
    assert.equal(url.pathname, "/auth/confirm");
    assert.equal(url.searchParams.get("type"), "email");
    assert.equal(url.searchParams.get("flow"), "magic");
  }
});

test("untrusted redirect hints cannot change destination or recovery template", () => {
  for (const redirect of ["https://attacker.invalid/auth/confirm?flow=magic", `${env.FORMA_APP_URL}/other?flow=magic`, "invalid"]) {
    const input = payload("signup"); input.email_data.redirect_to = redirect;
    const message = buildAuthMessage(input, env);
    assert.equal(message.template.id, "verify");
    assert.equal(new URL(message.template.variables.ACTION_URL).origin, env.FORMA_APP_URL);
  }
  assert.equal(buildAuthMessage(payload("recovery"), env).template.id, "reset");
  assert.throws(() => buildAuthMessage(payload("magiclink"), { ...env, FORMA_RESEND_TEMPLATE_MAGIC_LINK_ID: "" }), /incomplete/);
  assert.throws(() => buildAuthMessage(payload("email_change"), env), /Unsupported/);
});

test("magic-link hook retries are deduplicated and provider failures remain failures", async () => {
  const sent = [];
  const hook = createEmailHook({ env, verify: () => payload("magiclink"), fetcher: async (_, options) => {
    sent.push(options); return Response.json({ id: "email" });
  } });
  const request = () => new Request("https://example.invalid", { method: "POST", body: "signed payload" });
  assert.equal((await hook(request())).status, 200);
  assert.equal((await hook(request())).status, 200);
  assert.equal(sent[0].headers["Idempotency-Key"], sent[1].headers["Idempotency-Key"]);
  assert.ok(!sent[0].headers["Idempotency-Key"].includes("hash"));
  const failed = createEmailHook({ env, verify: () => payload("magiclink"), fetcher: async () => new Response(null, { status: 403 }) });
  assert.equal((await failed(request())).status, 500);
});
