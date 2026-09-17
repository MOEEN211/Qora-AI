import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { bootstrapSetup, readBootstrapState, completeBootstrap, bootstrapManagement, discoverSender, checkBootstrapStripe } from "../../scripts/kickstart/bootstrap.mjs";
import { updateEnvText } from "../../scripts/kickstart/env-file.mjs";
import { parseEnv } from "node:util";

const ref = "abcdefghijklmnopqrst";
const input = { SUPABASE_ACCESS_TOKEN: "test-management", RESEND_API_KEY: "test-resend", STRIPE_TEST_SECRET_KEY: "sk_test_fixture" };
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "forma-bootstrap-"));
  t.after(async () => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith("forma-bootstrap-"));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(join(root, "config"));
  await writeFile(join(root, "config/billing-seed.json"), '{"enabled":true}');
  const state = { projects: [], keys: [], writes: [], reads: [], domains: [], organizations: [{ id: "org-id", slug: "org-slug", name: "Example" }], owner: "user-1", stripeAccount: "acct_test" };
  const management = async (path, body) => {
    if (body) {
      // Every service must already have finished its read-only check.
      for (const service of ["/organizations", "/projects", "domains", "templates", "stripe", "ai"]) assert.ok(state.reads.includes(service), service);
      state.writes.push(path);
      if (state.reject === path) { const error = new Error("Definite rejection"); error.definitelyRejected = true; throw error; }
      if (path === "/projects") {
        assert.equal(body.region_selection.type, "specific");
        assert.ok(body.db_pass.length >= 40);
        state.projects.push({ ref, organization_slug: body.organization_slug, name: body.name, region: body.region_selection.code, status: state.health || "ACTIVE_HEALTHY" });
        if (state.loseProject) { state.loseProject = false; throw new Error("Lost project response"); }
        return state.projects[0];
      }
      if (path.includes("/api-keys")) {
        if (body.type === "secret") assert.deepEqual(body.secret_jwt_template, { role: "service_role" });
        state.keys.push({ type: body.type, name: body.name, api_key: `sb_${body.type}_fixture` });
        if (state.loseKey === body.type) { state.loseKey = null; throw new Error("Lost key response"); }
        return state.keys.at(-1);
      }
      throw new Error("Unexpected write");
    }
    state.reads.push(path);
    if (state.fail === path) throw new Error("Rejected credential");
    if (path === "/profile") return { gotrue_id: state.owner };
    if (path === "/organizations") return state.organizations;
    if (path === "/projects") return state.projects;
    if (path.startsWith("/projects/available-regions")) return { all: { specific: state.regions || [{ code: "us-east-1", type: "specific", provider: "AWS" }] } };
    if (path === `/projects/${ref}`) return state.projects[0];
    if (path.includes("/api-keys")) return state.hideKeys ? [] : state.keys;
    throw new Error("Unexpected read");
  };
  const api = {
    domains: async () => { state.reads.push("domains"); if (state.fail === "resend") throw new Error("Rejected Resend"); return state.domains; },
    resendList: async () => { state.reads.push("templates"); if (state.fail === "templates") throw new Error("Template permission missing"); return []; },
  };
  const run = async (overrides = {}) => bootstrapSetup({ root, env: input, state: await readBootstrapState(root), management, api,
    stripeCheck: async () => { state.reads.push("stripe"); if (state.fail === "stripe") throw new Error("Rejected Stripe"); return state.stripeAccount; },
    aiCheck: async () => { state.reads.push("ai"); if (state.fail === "ai") throw new Error("Rejected AI"); },
    choose: async (label, options) => { if (options.length !== 1) throw new Error(`Ambiguous ${label}`); return options[0].value; },
    sleep: async () => {}, attempts: 2, log: () => {}, ...overrides });
  return { root, state, run };
}

test("three credentials: read-only check writes nothing; install creates one US project and recovers environment values", async t => {
  const { root, state, run } = await fixture(t);
  const checked = await run({ checkOnly: true });
  assert.equal(checked.checked, true);
  assert.deepEqual(state.writes, []);
  assert.equal(await readBootstrapState(root), null);
  await assert.rejects(readFile(join(root, ".env")), { code: "ENOENT" });
  const result = await run();
  assert.equal(result.env.SUPABASE_PROJECT_REF, ref);
  assert.equal(result.env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
  assert.equal(result.env.SUPABASE_SECRET_KEY, "sb_secret_fixture");
  assert.equal(result.env.RESEND_FROM_EMAIL, "onboarding@resend.dev");
  assert.equal(result.env.RESEND_TEST_MODE, "true");
  assert.equal(state.projects[0].region, "us-east-1");
  assert.deepEqual(state.writes, ["/projects", `/projects/${ref}/api-keys?reveal=true`, `/projects/${ref}/api-keys?reveal=true`]);
  const count = state.writes.length;
  const recovered = await run(); // Simulate losing .env before the full installer saves it.
  assert.deepEqual(recovered.env, result.env);
  assert.equal(state.writes.length, count);
  const receipt = await readFile(join(root, ".kickstart/bootstrap.json"), "utf8");
  for (const value of [input.SUPABASE_ACCESS_TOKEN, input.RESEND_API_KEY, input.STRIPE_TEST_SECRET_KEY, result.env.SUPABASE_SECRET_KEY]) assert.ok(!receipt.includes(value));
  const source = Object.entries(input).map(([key, value]) => `${key}=${value}`).join("\n");
  assert.deepEqual(parseEnv(updateEnvText(source, result.generated)), result.env);
});

test("every required service failure blocks project and key creation", async t => {
  for (const failure of ["/organizations", "/projects", "resend", "templates", "stripe", "ai"]) {
    await t.test(failure, async t => {
      const { state, run, root } = await fixture(t);
      state.fail = failure;
      await assert.rejects(run());
      assert.deepEqual(state.writes, []);
      assert.equal(await readBootstrapState(root), null);
    });
  }
});

test("missing credentials, live Stripe key, invalid settings and ambiguous account block before writes", async t => {
  const { state, run } = await fixture(t);
  for (const env of [{ ...input, RESEND_API_KEY: "" }, { ...input, STRIPE_TEST_SECRET_KEY: "sk_live_fixture" }, { ...input, APP_URL: "https://example.com/path" }, { ...input, AUTH_EMAIL_VERIFICATION: "maybe" }]) {
    await assert.rejects(run({ env }));
    assert.deepEqual(state.reads, []);
    assert.deepEqual(state.writes, []);
  }
  state.organizations.push({ id: "org-2", slug: "other-org" });
  await assert.rejects(run(), /Ambiguous/);
  assert.deepEqual(state.writes, []);
  await run({ env: { ...input, SUPABASE_ORGANIZATION_SLUG: "org-slug" } });
  assert.equal(state.projects.length, 1);
});

test("lost project creation response is recovered once, without adopting an unrelated project", async t => {
  const { state, run, root } = await fixture(t);
  state.projects.push({ ref: "zzzzzzzzzzzzzzzzzzzz", name: "Forma", organization_slug: "org-slug" });
  state.loseProject = true;
  await assert.rejects(run(), /Lost project/);
  assert.equal((await readBootstrapState(root)).pending, true);
  // Return the created project first for the fixture's GET by ref.
  state.projects.reverse();
  const result = await run();
  assert.equal(result.env.SUPABASE_PROJECT_REF, ref);
  assert.equal(state.writes.filter(path => path === "/projects").length, 1);
});

test("an unresolved project request never triggers another create request", async t => {
  const { state, run } = await fixture(t);
  state.loseProject = true;
  await assert.rejects(run());
  state.projects = [];
  await assert.rejects(run(), /unresolved/);
  assert.equal(state.writes.length, 1);
});

test("definitely rejected creation can be retried after permissions are fixed", async t => {
  const { state, run, root } = await fixture(t);
  state.reject = "/projects";
  await assert.rejects(run(), /Definite rejection/);
  assert.equal((await readBootstrapState(root)).pending, false);
  state.reject = null;
  await run();
  assert.equal(state.projects.length, 1);
});

test("lost API-key responses are reconciled without creating duplicate keys", async t => {
  for (const type of ["publishable", "secret"]) await t.test(type, async t => {
    const { state, run } = await fixture(t);
    state.loseKey = type;
    await assert.rejects(run(), /Lost key/);
    await run();
    assert.equal(state.keys.filter(key => key.type === type).length, 1);
    assert.equal(state.projects.length, 1);
  });
});

test("unhealthy projects resume, while account changes and inaccessible targets never create replacements", async t => {
  const { state, run } = await fixture(t);
  state.health = "COMING_UP";
  await assert.rejects(run(), /still starting/);
  state.projects[0].status = "ACTIVE_HEALTHY";
  state.projects[0].organization_slug = "different-org";
  await assert.rejects(run(), /organization does not match/);
  state.projects[0].organization_slug = "org-slug";
  state.stripeAccount = "acct_other";
  await assert.rejects(run(), /account\/key changed/);
  state.stripeAccount = "acct_test";
  await run();
  state.projects = [];
  await assert.rejects(run(), /not accessible/);
  assert.equal(state.writes.filter(path => path === "/projects").length, 1);
});

test("existing installs keep values; missing project identity with receipts blocks replacement", async t => {
  const { root, state, run } = await fixture(t);
  const env = { ...input, SUPABASE_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_existing", SUPABASE_SECRET_KEY: "sb_secret_existing", RESEND_FROM_EMAIL: "hello@example.com", APP_NAME: "My app", APP_URL: "http://localhost:4000" };
  assert.deepEqual((await run({ env })).generated, {});
  assert.deepEqual(state.reads, []);
  await mkdir(join(root, ".kickstart"));
  await writeFile(join(root, ".kickstart", `${ref}.json`), '{}');
  await assert.rejects(run(), /Existing kickstart state/);
  assert.deepEqual(state.writes, []);
});

test("sender discovery uses verified domains, respects overrides, and limits fallback to local testing", async () => {
  const api = domains => ({ domains: async () => domains, resendList: async () => [] });
  const env = { APP_URL: "http://localhost:3000" };
  await discoverSender(env, api([{ name: "example.com", status: "verified" }]));
  assert.equal(env.RESEND_FROM_EMAIL, "noreply@example.com");
  assert.equal(env.RESEND_TEST_MODE, "false");
  await assert.rejects(discoverSender({ APP_URL: "https://example.com" }, api([])), /No verified/);
  await assert.rejects(discoverSender({ APP_URL: "http://localhost:3000", RESEND_TEST_MODE: "false" }, api([])), /No verified/);
  const explicit = { APP_URL: "http://localhost:3000", RESEND_FROM_EMAIL: "billing@example.com" };
  await discoverSender(explicit, api([{ name: "example.com", status: "verified" }]));
  assert.equal(explicit.RESEND_FROM_EMAIL, "billing@example.com");
});

test("US capacity fallback never silently moves a new project outside the US", async t => {
  const { state, run } = await fixture(t);
  state.regions = [{ code: "us-east-1", status: "capacity" }, { code: "eu-west-1" }];
  await assert.rejects(run(), /no available capacity/);
  assert.deepEqual(state.writes, []);
  state.regions.push({ code: "us-west-2" });
  await run();
  assert.equal(state.projects[0].region, "us-west-2");
});

test("transport errors redact provider bodies and request credentials", async () => {
  const api = bootstrapManagement("private-token", async () => new Response("secret-provider-body", { status: 403 }));
  await assert.rejects(api("/projects", { db_pass: "private-password" }), error => {
    assert.ok(error.definitelyRejected);
    assert.match(error.message, /HTTP 403/);
    assert.doesNotMatch(error.message, /private-token|private-password|secret-provider-body/);
    return true;
  });
  await assert.rejects(checkBootstrapStripe({ STRIPE_TEST_SECRET_KEY: "sk_live_fixture" }), /sandbox/);
});

test("project-scoped tokens can recover existing keys without organization-wide visibility or writes", async t => {
  const { state, run } = await fixture(t);
  state.organizations = [];
  state.projects = [{ ref, organization_slug: "org-slug", status: "ACTIVE_HEALTHY" }];
  state.keys = ["publishable", "secret"].map(type => ({ type, name: "default", api_key: `sb_${type}_existing` }));
  const result = await run({ env: { ...input, SUPABASE_PROJECT_REF: ref }, checkOnly: true });
  assert.equal(result.env.SUPABASE_SECRET_KEY, "sb_secret_existing");
  assert.deepEqual(state.writes, []);
  state.keys.push({ type: "secret", name: "default", api_key: "sb_secret_second" });
  await assert.rejects(run({ env: { ...input, SUPABASE_PROJECT_REF: ref }, checkOnly: true }), /Multiple Supabase secret keys/);
  assert.deepEqual(state.writes, []);
});

test("provider binding survives an env save until installation completes; completed installs permit normal key rotation", async t => {
  const { root, state, run } = await fixture(t);
  const first = await run();
  await assert.rejects(run({ env: { ...first.env, RESEND_API_KEY: "rotated-resend" } }), /account\/key changed/);
  await completeBootstrap(root, ref);
  const before = state.reads.length;
  const result = await run({ env: { ...first.env, RESEND_API_KEY: "rotated-resend" } });
  assert.equal(result.env.RESEND_API_KEY, "rotated-resend");
  assert.equal(state.reads.length, before);
  assert.equal((await readBootstrapState(root)).complete, true);
});
