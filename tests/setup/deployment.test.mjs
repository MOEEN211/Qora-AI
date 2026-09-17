import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { setupEnvironment } from "../../scripts/kickstart/environment.mjs";
import { loadTemplates } from "../../scripts/kickstart/templates.mjs";

test("deployment preserves shared Supabase credentials and Resend template identities", async () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const env = {
    APP_NAME: "Forma", APP_URL: "http://localhost:3000", APP_URL_LIVE: "https://example.com",
    SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake", SUPABASE_SECRET_KEY: "sb_secret_fake",
    SUPABASE_EMAIL_HOOK_SECRET: "v1,whsec_fake", RESEND_FROM_EMAIL: "hello@example.com",
    RESEND_TEMPLATE_WELCOME_ID: "welcome", RESEND_TEMPLATE_VERIFICATION_ID: "verification",
    RESEND_TEMPLATE_PASSWORD_RESET_ID: "reset", RESEND_TEMPLATE_WORKSPACE_INVITATION_ID: "invitation",
  };
  const local = setupEnvironment(env);
  const live = setupEnvironment(env, true);
  assert.deepEqual(local, env);
  assert.deepEqual(live, { ...env, APP_URL: env.APP_URL_LIVE });
  assert.equal(env.APP_URL, "http://localhost:3000");
  // Identical provider aliases/payloads select the existing published templates,
  // including when switching back to a local kickstart after deployment.
  assert.deepEqual(await loadTemplates(root, live), await loadTemplates(root, local));
  const example = parseEnv(await readFile(new URL("../../.env.example", import.meta.url), "utf8"));
  assert.ok(!Object.keys(example).some(key => /^(SUPABASE_LIVE_|RESEND_LIVE_TEMPLATE_)/.test(key)));
});
