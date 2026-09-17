import test from "node:test";
import assert from "node:assert/strict";
import { discoverDeployment } from "../../scripts/kickstart/deploy-discovery.mjs";
import { deploymentApi } from "../../scripts/kickstart/deploy-api.mjs";

const env = { GITHUB_TOKEN: "test-github", VERCEL_TOKEN: "test-vercel", APP_NAME: "My SaaS", SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst" };
function provider({ teams = [{ id: "team_one", name: "Personal" }], occupied = false } = {}) {
  const calls = [];
  return { calls, api: {
    github: async (path, options) => { calls.push({ path, options }); return path === "/user" ? { id: 1, login: "buyer" } : occupied && path === "/repos/buyer/my-saas" ? { id: 99 } : null; },
    vercel: async (path, options) => { calls.push({ path, options }); return path.startsWith("/v2/teams?") ? { teams } : occupied && path.startsWith("/v9/projects/my-saas?") ? { id: "prj_existing" } : null; },
  } };
}

test("two tokens discover owner/team, derive names and propose an origin with no writes or input mutation", async () => {
  const p = provider(); const input = { ...env };
  const result = await discoverDeployment({ env: input, api: p.api });
  assert.equal(result.env.GITHUB_OWNER, "buyer");
  assert.equal(result.env.GITHUB_REPO_NAME, "my-saas");
  assert.equal(result.env.VERCEL_PROJECT_NAME, "my-saas");
  assert.equal(result.env.VERCEL_TEAM_ID, "team_one");
  assert.equal(result.env.APP_URL_LIVE, "https://my-saas.vercel.app");
  assert.equal(result.automaticOrigin, true);
  assert.deepEqual(input, env);
  assert.ok(p.calls.every(call => !call.options?.method));
});

test("multiple teams require a valid selection; empty/invalid choices do not guess", async () => {
  const p = provider({ teams: [{ id: "team_one" }, { id: "team_two" }] });
  let asked = false;
  const result = await discoverDeployment({ env, api: p.api, choose: async teams => { asked = true; assert.equal(teams.length, 2); return "team_two"; } });
  assert.equal(asked, true); assert.equal(result.env.VERCEL_TEAM_ID, "team_two");
  await assert.rejects(discoverDeployment({ env, api: p.api, choose: async () => "team_foreign" }), /not accessible/);
  await assert.rejects(discoverDeployment({ env, api: provider({ teams: [] }).api }), /No Vercel team/);
});

test("name collisions choose stable unused suffixes instead of adopting unrelated resources", async () => {
  const p = provider({ occupied: true });
  const one = await discoverDeployment({ env, api: p.api });
  const two = await discoverDeployment({ env, api: p.api });
  assert.match(one.env.GITHUB_REPO_NAME, /^my-saas-[a-f0-9]{8}$/);
  assert.equal(one.env.GITHUB_REPO_NAME, two.env.GITHUB_REPO_NAME);
  assert.equal(one.env.VERCEL_PROJECT_NAME, two.env.VERCEL_PROJECT_NAME);
});

test("receipts restore generated values and pin account identity across interrupted creation", async () => {
  const p = provider();
  const state = { githubUserId: 1, target: { repo: "buyer/recorded", name: "recorded-project", team: "team_one", origin: "https://assigned.vercel.app" }, repoId: 42, projectId: "prj_saved", automaticOrigin: true };
  const result = await discoverDeployment({ env, state, api: p.api });
  assert.equal(result.env.GITHUB_REPO_ID, "42"); assert.equal(result.env.VERCEL_PROJECT_ID, "prj_saved");
  assert.equal(result.env.APP_URL_LIVE, state.target.origin);
  assert.equal(p.calls.length, 1);
  await assert.rejects(discoverDeployment({ env, state: { ...state, githubUserId: 2 }, api: p.api }), /different account/);
  const custom = await discoverDeployment({ env: { ...env, APP_URL_LIVE: "https://custom.example.com" }, state, api: p.api });
  assert.equal(custom.automaticOrigin, false);
});

test("missing tokens stop before discovery and unscoped requests omit undefined team IDs", async () => {
  const p = provider();
  await assert.rejects(discoverDeployment({ env: {}, api: p.api }), /GITHUB_TOKEN, VERCEL_TOKEN/);
  assert.equal(p.calls.length, 0);
  const api = deploymentApi(env, async url => { assert.equal(url.searchParams.has("teamId"), false); return Response.json({ teams: [] }); });
  await api.vercel("/v2/teams");
});

test("team pagination considers every page and rejects cyclic cursors", async () => {
  const p = provider(); let pages = 0;
  p.api.vercel = async path => {
    if (!path.startsWith("/v2/teams")) return null;
    pages++;
    return pages === 1 ? { teams: [{ id: "team_one" }], pagination: { next: 123 } } : { teams: [{ id: "team_two" }], pagination: { next: null } };
  };
  const result = await discoverDeployment({ env, api: p.api, choose: async teams => { assert.equal(teams.length, 2); return "team_two"; } });
  assert.equal(result.env.VERCEL_TEAM_ID, "team_two");
  p.api.vercel = async () => ({ teams: [{ id: "team_one" }], pagination: { next: 1 } });
  await assert.rejects(discoverDeployment({ env, api: p.api }), /pagination/);
});
