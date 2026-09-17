import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve, basename } from "node:path";
import { parseEnv } from "node:util";
import { deploymentConfig, deploymentInputErrors, productionEnvironment } from "../../scripts/kickstart/deploy-config.mjs";
import { deploymentApi } from "../../scripts/kickstart/deploy-api.mjs";
import { createDeploymentSetup } from "../../scripts/kickstart/deploy.mjs";
import { sourceSnapshot, excludedSource, pushSnapshot, git } from "../../scripts/kickstart/deploy-source.mjs";
import { executeSetup } from "../../scripts/kickstart/core.mjs";

const envBase = {
  APP_NAME: "Example", APP_URL: "https://example.com", APP_URL_LIVE: "https://example.com", GITHUB_TOKEN: "github-test-credential", GITHUB_OWNER: "buyer", GITHUB_REPO_NAME: "saas",
  VERCEL_TOKEN: "vercel-test-credential", VERCEL_TEAM_ID: "team_buyer", VERCEL_PROJECT_NAME: "buyer-saas", SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example", SUPABASE_SECRET_KEY: "sb_secret_example",
  SUPABASE_ACCESS_TOKEN: "management-credential", RESEND_API_KEY: "email-credential", RESEND_FROM_EMAIL: "hello@example.com", RESEND_TEST_MODE: "false",
  RESEND_TEMPLATE_WELCOME_ID: "welcome-id", RESEND_TEMPLATE_WORKSPACE_INVITATION_ID: "invitation-id", STRIPE_LIVE_SECRET_KEY: "sk_live_example", STRIPE_TEST_SECRET_KEY: "sk_test_example",
};
const copy = value => structuredClone(value);

test("deployment reports missing live credentials and the production sender together without leaking values", () => {
  const input = { ...envBase, STRIPE_LIVE_SECRET_KEY: "invalid-private-value", RESEND_TEST_MODE: "true", RESEND_FROM_EMAIL: "onboarding@resend.dev" };
  const errors = deploymentInputErrors(input, true);
  assert.equal(errors.length, 2);
  assert.match(errors.join("\n"), /STRIPE_LIVE_SECRET_KEY/);
  assert.match(errors.join("\n"), /resend.com\/domains/);
  assert.ok(!errors.join("\n").includes(input.STRIPE_LIVE_SECRET_KEY));
  assert.deepEqual(deploymentInputErrors(envBase, true), []);
  assert.deepEqual(deploymentInputErrors({ ...envBase, STRIPE_LIVE_SECRET_KEY: "", STRIPE_TEST_SECRET_KEY: "" }, false), []);
});

test("explicit temporary email deployment keeps live billing and setup-only override out of runtime", () => {
  const env = { ...envBase, RESEND_FROM_EMAIL: "onboarding@resend.dev", RESEND_TEST_MODE: "true", RESEND_ALLOW_TEST_DEPLOYMENT: "true" };
  assert.deepEqual(deploymentInputErrors(env, true), []);
  assert.equal(deploymentConfig(env).origin, env.APP_URL_LIVE);
  const runtime = productionEnvironment(env, true);
  assert.equal(runtime.find(row => row.key === "STRIPE_LIVE_SECRET_KEY").value, env.STRIPE_LIVE_SECRET_KEY);
  assert.equal(runtime.find(row => row.key === "RESEND_FROM_EMAIL").value, "onboarding@resend.dev");
  assert.equal(runtime.find(row => row.key === "RESEND_TEST_MODE").value, "true");
  assert.ok(!runtime.some(row => row.key === "RESEND_ALLOW_TEST_DEPLOYMENT"));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "forma-deploy-test-"));
  const env = { ...envBase };
  await writeFile(join(root, ".env"), Object.entries(env).map(([key,value]) => `${key}=${value}`).join("\n") + "\n# buyer comment\n");
  const remote = { repo: null, project: null, head: null, rows: [], deployments: [], writes: [], fail: null, counter: 0, sourceHash: "source-one", domainReady: true };
  function mutation(name) { remote.writes.push(name); if (remote.fail === name) { remote.fail = null; throw new Error("Lost provider response"); } }
  const api = {
    github: async (path, options = {}) => {
      if (path === "/user") return { id: 12, login: "buyer" };
      if (path === "/users/buyer") return { id: 12, login: "buyer", type: "User" };
      if (path === "/user/repos") { remote.repo = { id: 100, full_name: "buyer/saas", private: true, permissions: { push: true }, description: options.body.description }; mutation("create-repo"); return copy(remote.repo); }
      if (path === "/repos/buyer/saas") return copy(remote.repo);
      if (path.includes("/branches?")) return remote.head ? [{ name: "main", commit: { sha: remote.head } }] : [];
      throw new Error(`Unexpected GitHub path: ${path}`);
    },
    vercel: async (path, options = {}) => {
      if (path === "/v2/teams/team_buyer") return { id: "team_buyer" };
      if (path.startsWith("/v1/integrations/git-namespaces")) return [{ id: 12, slug: "buyer", installationId: 1 }];
      if (path.startsWith("/v1/integrations/search-repo")) return { repos: remote.repo ? [{ id: remote.repo.id }] : [] };
      if (path === "/v11/projects") {
        assert.equal(options.body.gitRepository.repo, "buyer/saas");
        remote.project = { id: "prj_buyer", accountId: "team_buyer", name: "buyer-saas", link: { type: "github", repoId: 100, productionBranch: "main" }, framework: "nextjs", buildCommand: "npm run build", installCommand: "npm ci", rootDirectory: null, nodeVersion: "24.x", previewDeploymentsDisabled: true };
        mutation("create-project"); return copy(remote.project);
      }
      if (/^\/v9\/projects\/[^/]+$/.test(path)) return copy(remote.project);
      if (path === "/v9/projects/prj_buyer/domains?limit=100") return { domains: remote.assignedDomains ?? [{ name: "assigned-saas.vercel.app" }] };
      if (/\/domains\/(example.com|assigned-saas.vercel.app)$/.test(path)) return { verified: remote.domainReady };
      if (/^\/v6\/domains\/(example.com|assigned-saas.vercel.app)\/config$/.test(path)) return { misconfigured: !remote.domainReady };
      if (path === "/v9/projects/prj_buyer/env") return { envs: copy(remote.rows) };
      if (path.startsWith("/v10/projects/prj_buyer/env")) {
        const body = options.body;
        assert.deepEqual(body.target, ["production"]);
        const prior = remote.rows.find(row => row.key === body.key);
        const row = { ...body, value: "withheld", id: prior?.id || `env_${++remote.counter}`, updatedAt: ++remote.counter };
        remote.rows = [...remote.rows.filter(item => item.key !== body.key), row];
        mutation(`env:${body.key}`); return { created: copy(row), failed: [] };
      }
      if (path.startsWith("/v6/deployments?")) return { deployments: copy(remote.deployments) };
      if (path === "/v13/deployments") {
        const deployment = { id: "dpl_test", projectId: "prj_buyer", target: "production", meta: options.body.meta, readyState: "READY" };
        assert.equal(options.body.gitSource.ref, remote.head);
        remote.deployments.push(deployment); mutation("create-deployment"); return copy(deployment);
      }
      if (path === "/v13/deployments/dpl_test") return copy(remote.deployments[0]);
      throw new Error(`Unexpected Vercel path: ${path}`);
    },
  };
  const publisher = async ({ beforePush }) => { const sha = "a".repeat(40); await beforePush(sha); remote.head = sha; mutation("push"); return sha; };
  async function run({ checkOnly = false, failRequired = false, automaticOrigin = false } = {}) {
    const setup = await createDeploymentSetup({ root, env, billingEnabled: true, discovery: automaticOrigin ? { automaticOrigin: true, githubUserId: 12 } : undefined, api, snapshotter: async () => ({ files: [["package.json", Buffer.from("{}")]], hash: remote.sourceHash }), publisher, gitCheck: async () => {}, fetcher: async () => new Response("ok"), pause: async () => {}, log: () => {} });
    return executeSetup({ env, probes: [setup.probe, { name: "required service", run: () => { if (failRequired) throw new Error("Missing required service"); } }], steps: [setup.prepare, setup.activate, { name: "live services", run: () => mutation("live-services") }, setup.finish], checkOnly });
  }
  async function cleanup() {
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith("forma-deploy-test-"));
    await rm(root, { recursive: true, force: true });
  }
  return { root, env, remote, run, cleanup, api };
}

test("deployment preflight is read-only and any required failure prevents every provider write", async () => {
  const f = await fixture(); try {
    const before = await readFile(join(f.root, ".env"), "utf8");
    assert.equal((await f.run({ checkOnly: true })).status, "checked");
    assert.deepEqual(f.remote.writes, []);
    assert.equal(await readFile(join(f.root, ".env"), "utf8"), before);
    assert.equal((await f.run({ failRequired: true })).status, "blocked");
    assert.deepEqual(f.remote.writes, []);
    delete f.env.VERCEL_TOKEN;
    assert.equal((await f.run()).status, "blocked");
    assert.deepEqual(f.remote.writes, []);
  } finally { await f.cleanup(); }
});

test("deployment creates linked resources, saves IDs, uses runtime-only production variables and resumes without duplicates", async () => {
  const f = await fixture(); try {
    const result = await f.run(); assert.equal(result.status, "complete", JSON.stringify(result));
    const generated = parseEnv(await readFile(join(f.root, ".env"), "utf8"));
    assert.equal(generated.GITHUB_REPO_ID, "100"); assert.equal(generated.VERCEL_PROJECT_ID, "prj_buyer");
    assert.equal(generated.GITHUB_TOKEN, envBase.GITHUB_TOKEN);
    assert.equal((await f.run()).status, "complete");
    for (const operation of ["create-repo", "push", "create-project", "create-deployment", "env:SUPABASE_SECRET_KEY"]) assert.equal(f.remote.writes.filter(value => value === operation).length, 1, operation);
    assert.ok(f.remote.writes.indexOf("create-project") < f.remote.writes.indexOf("live-services"));
    assert.ok(!f.remote.rows.some(row => /GITHUB|VERCEL_TOKEN|STRIPE_TEST|ACCESS_TOKEN|HOOK_SECRET/.test(row.key)));
    assert.equal(f.remote.rows.find(row => row.key === "SUPABASE_SECRET_KEY").type, "sensitive");
    const receipt = await readFile(join(f.root, ".kickstart/deploy-abcdefghijklmnopqrst.json"), "utf8");
    assert.ok(!receipt.includes(envBase.GITHUB_TOKEN)); assert.ok(!receipt.includes(envBase.SUPABASE_SECRET_KEY));
  } finally { await f.cleanup(); }
});

for (const failure of ["create-repo", "push", "create-project", "env:SUPABASE_SECRET_KEY", "create-deployment"]) {
  test(`lost ${failure} response resumes without duplicate resources`, async () => {
    const f = await fixture(); try {
      f.remote.fail = failure;
      assert.equal((await f.run()).status, "partial");
      const result = await f.run(); assert.equal(result.status, "complete", JSON.stringify(result));
      assert.equal(f.remote.writes.filter(value => value === failure).length, 1);
    } finally { await f.cleanup(); }
  });
}

test("buyer environment edits, changed targets and unexpected remote commits stop in preflight", async () => {
  const f = await fixture(); try {
    assert.equal((await f.run()).status, "complete");
    const writes = f.remote.writes.length;
    f.remote.rows[0].updatedAt++;
    assert.equal((await f.run()).status, "blocked");
    f.remote.rows[0].updatedAt--;
    f.env.VERCEL_TEAM_ID = "team_other";
    assert.equal((await f.run()).status, "blocked");
    f.env.VERCEL_TEAM_ID = "team_buyer";
    f.remote.head = "b".repeat(40);
    assert.equal((await f.run()).status, "blocked");
    assert.equal(f.remote.writes.length, writes);
  } finally { await f.cleanup(); }
});

test("DNS failure pauses before shared live provider configuration", async () => {
  const f = await fixture(); try {
    f.remote.domainReady = false;
    assert.equal((await f.run()).status, "partial");
    assert.ok(!f.remote.writes.includes("live-services"));
    f.remote.domainReady = true;
    assert.equal((await f.run()).status, "complete");
  } finally { await f.cleanup(); }
});

test("an unrelated occupied repository is never adopted implicitly", async () => {
  const f = await fixture(); try {
    f.remote.repo = { id: 200, full_name: "buyer/saas", private: true, permissions: { push: true }, description: "Buyer's work" };
    const result = await f.run(); assert.equal(result.status, "blocked"); assert.deepEqual(f.remote.writes, []);
  } finally { await f.cleanup(); }
});

test("automatic origin uses Vercel's assigned domain and preserves the local origin", async () => {
  const f = await fixture(); try {
    const local = parseEnv(await readFile(join(f.root, ".env"), "utf8")).APP_URL;
    const result = await f.run({ automaticOrigin: true });
    assert.equal(result.status, "complete", JSON.stringify(result));
    const saved = parseEnv(await readFile(join(f.root, ".env"), "utf8"));
    assert.equal(saved.APP_URL, local);
    assert.equal(saved.APP_URL_LIVE, "https://assigned-saas.vercel.app");
    assert.equal(f.env.APP_URL, saved.APP_URL_LIVE);
    assert.equal(f.remote.rows.find(row => row.key === "APP_URL").value, "withheld");
    const receipt = JSON.parse(await readFile(join(f.root, ".kickstart/deploy-abcdefghijklmnopqrst.json"), "utf8"));
    assert.equal(receipt.target.origin, saved.APP_URL_LIVE);
    assert.equal(receipt.githubUserId, 12);
    assert.equal((await f.run({ automaticOrigin: true })).status, "complete");
  } finally { await f.cleanup(); }
});

test("ambiguous automatic domains pause before live services and resume without duplicates", async () => {
  const f = await fixture(); try {
    f.remote.assignedDomains = [{ name: "preview.vercel.app", gitBranch: "dev" }, { name: "one.vercel.app" }, { name: "two.vercel.app" }];
    const result = await f.run({ automaticOrigin: true });
    assert.equal(result.status, "partial");
    assert.match(result.message, /unambiguous production domain/);
    assert.ok(!f.remote.writes.includes("live-services"));
    f.remote.assignedDomains = [{ name: "assigned-saas.vercel.app" }];
    assert.equal((await f.run({ automaticOrigin: true })).status, "complete");
    assert.equal(f.remote.writes.filter(value => value === "create-project").length, 1);
  } finally { await f.cleanup(); }
});

test("runtime mapping respects disabled billing/AI and never ships opposite-mode or setup secrets", () => {
  const values = productionEnvironment({ ...envBase, AI_ENABLED: "false", OPENROUTER_API_KEY: "private", CONTACT_TO_EMAIL: "owner@example.com", SEO_INDEXABLE: "false" }, false);
  assert.equal(values.find(row => row.key === "STRIPE_LIVE_SECRET_KEY").value, "");
  assert.equal(values.find(row => row.key === "OPENROUTER_API_KEY").value, "");
  assert.equal(values.find(row => row.key === "CONTACT_TO_EMAIL").value, "owner@example.com");
  assert.ok(!JSON.stringify(values).includes(envBase.GITHUB_TOKEN));
  assert.throws(() => deploymentConfig({ ...envBase, APP_URL_LIVE: "http://localhost:3000" }), /HTTPS/);
});

test("provider errors never expose response bodies or credentials and do not follow redirects", async () => {
  const api = deploymentApi(envBase, async (_url, options) => { assert.equal(options.redirect, "error"); return new Response(envBase.GITHUB_TOKEN, { status: 403 }); });
  await assert.rejects(api.github("/user"), error => error.message.includes("403") && !error.message.includes(envBase.GITHUB_TOKEN));
});

test("GitHub repository creation denial explains the required permissions without exposing its response", async () => {
  const api = deploymentApi(envBase, async () => new Response(envBase.GITHUB_TOKEN, { status: 403 }));
  await assert.rejects(api.github("/user/repos", { method: "POST", body: { name: "saas", private: true } }), error => error.message.includes("Administration: Read and write") && error.message.includes("All repositories") && !error.message.includes(envBase.GITHUB_TOKEN));
});

test("source export excludes credentials/artifacts, rejects escapes and detects embedded configured secrets", async () => {
  const f = await fixture(); try {
    await mkdir(join(f.root, "config")); await mkdir(join(f.root, "app"));
    await writeFile(join(f.root, "config/deployment.json"), JSON.stringify({ sourcePaths: ["app", ".env", "package.json", "package-lock.json", ".gitignore"] }));
    for (const name of ["package.json", "package-lock.json", ".gitignore"]) await writeFile(join(f.root, name), "{}");
    await writeFile(join(f.root, "app/page.ts"), "export default 1;");
    const snapshot = await sourceSnapshot(f.root, f.env);
    assert.ok(!snapshot.files.some(([name]) => name === ".env"));
    for (const name of [".env.local", "app/.env", ".kickstart/state.json", "supabase/.temp/id", "artifacts/screenshot.png", "private.pem"]) assert.ok(excludedSource(name));
    await writeFile(join(f.root, "app/page.ts"), f.env.GITHUB_TOKEN);
    await assert.rejects(sourceSnapshot(f.root, f.env), /credential/);
    await writeFile(join(f.root, "config/deployment.json"), JSON.stringify({ sourcePaths: ["../other"] }));
    await assert.rejects(sourceSnapshot(f.root, f.env), /Invalid deployment source/);
  } finally { await f.cleanup(); }
});

test("real Git snapshot transport preserves binary bytes, deduplicates unchanged trees and rejects a stale parent", async () => {
  const f = await fixture(); try {
    const remote = join(f.root, "remote.git");
    await git(["init", "--bare", remote], f.root);
    const runGit = (args, cwd, credentials) => git(args.map(arg => arg === "https://github.com/buyer/saas.git" ? remote : arg), cwd, { user: credentials?.user });
    const snapshot = { files: [["app/page.js", Buffer.from("export default 1\r\n")], ["public/icon.png", Buffer.from([0, 255, 123, 0, 2])]] };
    const options = { snapshot, config: { repo: "buyer/saas" }, user: { id: 12, login: "buyer" }, runGit, beforePush: async () => {} };
    const first = await pushSnapshot(options);
    assert.match(first, /^[a-f0-9]{40}$/);
    assert.equal(await git(["rev-parse", "refs/heads/main"], remote), first);
    assert.equal(await pushSnapshot({ ...options, parent: first }), first);
    const blob = await git(["rev-parse", `${first}:public/icon.png`], remote);
    // Verify the binary object through Git's known blob SHA calculation.
    const { createHash } = await import("node:crypto");
    const data = snapshot.files[1][1];
    assert.equal(blob, createHash("sha1").update(`blob ${data.length}\0`).update(data).digest("hex"));
    await assert.rejects(pushSnapshot({ ...options, parent: "b".repeat(40) }), /changed since preflight/);
  } finally { await f.cleanup(); }
});
