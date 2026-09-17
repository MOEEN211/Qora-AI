import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { digest } from "./core.mjs";
import { saveGeneratedEnv } from "./env-file.mjs";
import { deploymentConfig, productionEnvironment } from "./deploy-config.mjs";
import { deploymentApi } from "./deploy-api.mjs";
import { sourceSnapshot, pushSnapshot, git } from "./deploy-source.mjs";

export const deploymentReceiptPath = (root, ref) => join(root, ".kickstart", `deploy-${/^[a-z0-9]{20}$/.test(ref || "") ? ref : "invalid"}.json`);
const hash = value => digest(JSON.stringify(value));
const metadata = row => ({ id: row.id, updatedAt: row.updatedAt ?? row.createdAt, type: row.type, target: row.target, comment: row.comment });
const gitHelp = "Authorize the Vercel GitHub App at https://github.com/apps/vercel/installations/new for this owner/repository, then rerun.";

export async function createDeploymentSetup({ root, env, billingEnabled, discovery, api = deploymentApi(env), snapshotter = sourceSnapshot, publisher = pushSnapshot, gitCheck = () => git(["--version"], root), fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)), log = console.log }) {
  const path = deploymentReceiptPath(root, env.SUPABASE_PROJECT_REF);
  let state = {};
  try { state = JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw new Error("Restore the unreadable deployment receipt in .kickstart."); }
  let config, snapshot, user, repo, project, namespace, head;
  const save = async () => { await mkdir(join(root, ".kickstart"), { recursive: true }); await writeFile(path + ".tmp", JSON.stringify(state, null, 2), { mode: 0o600 }); await rename(path + ".tmp", path); };
  const saveEnv = async values => { await saveGeneratedEnv(join(root, ".env"), values); Object.assign(env, values); };
  const repository = () => `/repos/${config.repo}`;
  const projectPath = () => `/v9/projects/${project.id}`;
  const settings = value => ({ framework: value.framework, buildCommand: value.buildCommand, installCommand: value.installCommand, rootDirectory: value.rootDirectory ?? null, nodeVersion: value.nodeVersion, previewDeploymentsDisabled: value.previewDeploymentsDisabled, productionBranch: value.link?.productionBranch });
  async function remoteHead() {
    const branches = await api.github(`${repository()}/branches?per_page=100`);
    if (!Array.isArray(branches)) throw new Error("Could not verify GitHub branches.");
    const branch = branches.find(item => item.name === "main");
    if (branches.length && !branch) throw new Error("Existing repository has no main branch. Use an empty repository for the initial installation.");
    return branch?.commit?.sha || null;
  }
  function assertRepo(value) {
    if (!value?.id || value.full_name?.toLowerCase() !== config.repo.toLowerCase() || !value.private || value.archived || !value.permissions?.push) throw new Error("Repository must be private, writable, unarchived, and match the configured GitHub owner/name.");
    const expected = state.repoId || env.GITHUB_REPO_ID;
    if (expected && String(value.id) !== String(expected)) throw new Error("GitHub repository identity changed. Restore the original target; no resources were overwritten.");
  }
  function assertProject(value) {
    if (!value?.id || value.accountId !== config.team || value.name !== config.projectName || value.link?.type !== "github" || String(value.link.repoId) !== String(repo.id)) throw new Error("Vercel project does not match the expected team and GitHub repository.");
    if (state.projectId && value.id !== state.projectId) throw new Error("Vercel project identity changed.");
    if (state.projectSettings && hash(settings(value)) !== state.projectSettings) throw new Error("Vercel build, branch or preview settings changed outside kickstart. Reconcile them before rerunning.");
  }
  async function checkGitAccess() {
    const query = new URLSearchParams({ provider: "github", namespaceId: String(namespace.id), query: config.name });
    const result = await api.vercel(`/v1/integrations/search-repo?${query}`);
    if (!result.repos?.some(item => String(item.id) === String(repo.id))) throw new Error(gitHelp);
  }
  async function readEnvs() {
    const result = await api.vercel(`${projectPath()}/env`);
    if (!Array.isArray(result.envs)) throw new Error("Could not inspect Vercel environment metadata.");
    return result.envs;
  }
  function checkEnvRows(rows) {
    // Opposite-mode/setup credentials anywhere in this managed project are a conflict.
    if (rows.some(row => /^(?:GITHUB_TOKEN|VERCEL_TOKEN|SUPABASE_ACCESS_TOKEN|STRIPE_TEST_SECRET_KEY|SUPABASE_EMAIL_HOOK_SECRET)$/.test(row.key))) throw new Error("Vercel contains setup-only or test credentials. Remove them from this production project before rerunning.");
    for (const desired of productionEnvironment(env, billingEnabled)) {
      const matches = rows.filter(row => row.key === desired.key);
      if (matches.length > 1) throw new Error(`Vercel ${desired.key} has multiple environment scopes. Reconcile before deployment.`);
      const row = matches[0];
      const prior = state.envs?.[desired.key];
      const pending = state.pendingEnv?.key === desired.key ? state.pendingEnv : null;
      if (!row) { if (prior) throw new Error(`Vercel ${desired.key} was removed outside kickstart.`); continue; }
      if (row.target?.length !== 1 || row.target[0] !== "production" || row.gitBranch || row.customEnvironmentIds?.length) throw new Error(`Vercel ${desired.key} must be production-only.`);
      if (pending && row.comment === pending.comment && row.type === desired.type) continue;
      if (!prior || hash(metadata(row)) !== prior.metadata) throw new Error(`Vercel ${desired.key} changed outside kickstart or has no receipt. Preserve/reconcile that value before retrying.`);
    }
  }
  const probe = { name: "GitHub, Vercel, deployment source and runtime preflight", run: async () => {
    config = deploymentConfig(env);
    const target = { supabase: env.SUPABASE_PROJECT_REF, repo: config.repo.toLowerCase(), team: config.team, name: config.projectName, origin: config.origin };
    if (state.target && hash({ ...state.target, origin: target.origin }) !== hash(target)) throw new Error("Deployment target differs from its receipt. Restore the configured target; use a separate copy/state for another installation.");
    if (state.liveActivated && state.target?.origin !== target.origin) throw new Error("The live origin changed after activation. Reconcile the production origin explicitly before continuing; do not delete its receipt.");
    await gitCheck();
    snapshot = await snapshotter(root, env);
    user = await api.github("/user");
    if (!Number.isSafeInteger(user.id) || !/^[a-zA-Z0-9-]+$/.test(user.login)) throw new Error("Could not verify the GitHub token owner.");
    const owner = await api.github(`/users/${config.owner}`);
    if (owner.type === "Organization") {
      const membership = await api.github(`/user/memberships/orgs/${config.owner}`);
      if (membership.state !== "active") throw new Error("GitHub organization membership must be active.");
    } else if (owner.id !== user.id) throw new Error("A personal repository must belong to the GitHub token owner.");
    const team = await api.vercel(`/v2/teams/${config.team}`);
    if (team.id !== config.team) throw new Error("Vercel team identity mismatch.");
    const namespaces = await api.vercel("/v1/integrations/git-namespaces?provider=github", { scope: false });
    namespace = Array.isArray(namespaces) && namespaces.find(item => item.slug.toLowerCase() === config.owner.toLowerCase() && !item.requireReauth && item.installationId);
    if (!namespace) throw new Error(gitHelp);
    repo = await api.github(repository(), { missing: true });
    if (repo) {
      assertRepo(repo);
      if (!state.repoId && !env.GITHUB_REPO_ID && repo.description !== state.repoMarker) throw new Error("Repository name already exists. To use your empty private repository, fill GITHUB_REPO_ID explicitly.");
      head = await remoteHead();
      if (head && head !== state.sha && head !== state.pendingPush?.sha) throw new Error("GitHub contains unrecorded commits. Kickstart will not overwrite buyer changes. Use an empty initial repository or reconcile the recorded source.");
      await checkGitAccess();
    } else if (state.repoId || env.GITHUB_REPO_ID) throw new Error("Recorded GitHub repository is missing or inaccessible. Restore access; it will not be recreated.");
    project = await api.vercel(`/v9/projects/${env.VERCEL_PROJECT_ID || config.projectName}`, { missing: true });
    if (project) {
      if (!repo || (!state.projectId && !state.creatingProject)) throw new Error("Vercel project already exists without this installer receipt. Choose an unused project name.");
      assertProject(project);
      checkEnvRows(await readEnvs());
    } else if (state.projectId || env.VERCEL_PROJECT_ID) throw new Error("Recorded Vercel project is missing or inaccessible; restore access.");
    state.target = target;
    log(`Deployment source: ${snapshot.files.length} files; private repository; main branch; production only.`);
    if (!repo) log("New repository access cannot be proven before creation. If Vercel grants selected repositories only, setup may pause after creation for GitHub App authorization.");
    log("Read checks do not prove repository creation/push, Vercel project/secret/deploy writes, DNS ownership, or successful builds. These are verified during provisioning.");
    return "GitHub/Vercel identities, observable access and credential-free source checked.";
  } };

  const prepare = { name: "Prepare GitHub repository, Vercel project and production domain", run: async () => {
    state.repoMarker ||= `Forma kickstart ${randomUUID()}`;
    if (discovery) { state.githubUserId = discovery.githubUserId; state.automaticOrigin = discovery.automaticOrigin; }
    await save();
    await saveEnv({ GITHUB_OWNER: config.owner, GITHUB_REPO_NAME: config.name, VERCEL_TEAM_ID: config.team, VERCEL_PROJECT_NAME: config.projectName });
    if (!repo) {
      const owner = await api.github(`/users/${config.owner}`);
      await api.github(owner.type === "Organization" ? `/orgs/${config.owner}/repos` : "/user/repos", { method: "POST", body: { name: config.name, private: true, auto_init: false, description: state.repoMarker } });
      repo = await api.github(repository());
      assertRepo(repo);
    }
    state.repoId = repo.id;
    await save();
    await saveEnv({ GITHUB_REPO_ID: String(repo.id), GITHUB_REPOSITORY: config.repo });
    await checkGitAccess();
    const current = await remoteHead();
    if (current && current !== state.sha && current !== state.pendingPush?.sha) throw new Error("GitHub changed after preflight; source was not overwritten.");
    if (current === state.pendingPush?.sha) { state.sha = current; state.sourceHash = state.pendingPush.sourceHash; state.pendingPush = null; await save(); }
    if (state.sourceHash !== snapshot.hash || !current) {
      // Once connected, main pushes can deploy immediately. Make source updates through
      // ordinary Git after bootstrap; setup reruns only reconcile this exact source.
      if (project) throw new Error("Source changed after the Vercel connection. Push application changes through Git; use this installer copy only to resume/reconcile the original deployment.");
      state.sha = await publisher({ snapshot, config, token: env.GITHUB_TOKEN, user, parent: current, beforePush: async sha => { state.pendingPush = { sha, sourceHash: snapshot.hash }; await save(); } });
      if (await remoteHead() !== state.sha) throw new Error("GitHub push could not be verified; rerun safely.");
      state.sourceHash = snapshot.hash;
      state.pendingPush = null;
      await save();
    }
    if (!project) {
      state.creatingProject = true;
      await save();
      await api.vercel("/v11/projects", { method: "POST", body: { name: config.projectName, framework: "nextjs", gitRepository: { type: "github", repo: config.repo }, buildCommand: "npm run build", installCommand: "npm ci", previewDeploymentsDisabled: true } });
      project = await api.vercel(`/v9/projects/${config.projectName}`);
      assertProject(project);
      if (project.previewDeploymentsDisabled !== true || project.link.productionBranch !== "main") throw new Error("Verify Vercel uses main for production and disables previews, then rerun.");
    }
    // Also finish the receipt after a lost project-creation response.
    if (!state.projectSettings) {
      if (project.framework !== "nextjs" || project.installCommand !== "npm ci" || project.buildCommand !== "npm run build" || project.rootDirectory || project.previewDeploymentsDisabled !== true || project.link.productionBranch !== "main") throw new Error("Created Vercel project configuration differs from the requested settings. Reconcile it before retrying.");
      state.projectId = project.id;
      state.projectSettings = hash(settings(project));
      state.creatingProject = false;
      await save();
    }
    await saveEnv({ VERCEL_PROJECT_ID: project.id });
    if (discovery?.automaticOrigin && !state.originPrepared) {
      const result = await api.vercel(`/v9/projects/${project.id}/domains?limit=100`);
      const candidates = result.domains?.filter(domain => /^[a-z0-9-]+\.vercel\.app$/.test(domain.name) && !domain.redirect && !domain.gitBranch && !domain.customEnvironmentId);
      const assigned = candidates?.find(domain => domain.name === config.domain) || (candidates?.length === 1 ? candidates[0] : null);
      if (!assigned) throw new Error("Vercel has not supplied an unambiguous production domain yet. Check Project > Settings > Domains, then rerun or set optional APP_URL_LIVE.");
      env.APP_URL_LIVE = `https://${assigned.name}`;
      env.APP_URL = env.APP_URL_LIVE;
      config = deploymentConfig(env);
      state.target.origin = config.origin;
    }
    let domain = await api.vercel(`${projectPath()}/domains/${config.domain}`, { missing: true });
    if (!domain) {
      await api.vercel(`/v10/projects/${project.id}/domains`, { method: "POST", body: { name: config.domain } });
      domain = await api.vercel(`${projectPath()}/domains/${config.domain}`);
    }
    const dns = await api.vercel(`/v6/domains/${config.domain}/config`);
    if (!domain.verified || dns.misconfigured !== false || domain.redirect || domain.gitBranch || domain.customEnvironmentId) throw new Error("Production domain is not verified/routed to production. Follow Vercel Project > Settings > Domains DNS instructions, then rerun. Shared Auth has not been switched by this step.");
    state.originPrepared = true;
    await save();
    await saveEnv({ APP_URL_LIVE: config.origin });
  } };

  const activate = { name: "Record shared production origin transition", run: async () => {
    // Record before provider writes, so a partial run cannot silently be reset locally.
    state.liveActivated = true;
    await save();
    log("Shared Supabase Auth/email/MCP will now use APP_URL_LIVE. OAuth clients need to reconnect. A failed build does not roll back provider changes.");
  } };

  const finish = { name: "Install Vercel runtime variables, deploy and verify production", run: async () => {
    project = await api.vercel(projectPath());
    assertProject(project);
    if (await remoteHead() !== state.sha) throw new Error("GitHub changed during provisioning. Resolve it before deploying this recorded commit.");
    const desiredRows = productionEnvironment(env, billingEnabled);
    for (const key of ["RESEND_TEMPLATE_WELCOME_ID", "RESEND_TEMPLATE_WORKSPACE_INVITATION_ID"]) if (!env[key]) throw new Error(`Missing generated ${key}; resume provider provisioning first.`);
    let rows = await readEnvs();
    checkEnvRows(rows);
    for (const desired of desiredRows) {
      const valueHash = hash(desired);
      const existing = rows.find(row => row.key === desired.key);
      state.envs ||= {};
      if (state.pendingEnv?.key === desired.key && existing?.comment === state.pendingEnv.comment) {
        state.envs[desired.key] = { hash: state.pendingEnv.hash, metadata: hash(metadata(existing)) };
        state.pendingEnv = null;
        await save();
      }
      if (state.envs[desired.key]?.hash === valueHash) continue;
      const comment = `forma-kickstart:${randomUUID()}`;
      state.pendingEnv = { key: desired.key, hash: valueHash, comment };
      await save();
      const result = await api.vercel(`/v10/projects/${project.id}/env${existing ? "?upsert=true" : ""}`, { method: "POST", body: { ...desired, comment } });
      if (result.failed?.length) throw new Error(`Vercel rejected ${desired.key}; fix permissions and rerun.`);
      rows = await readEnvs();
      const row = rows.find(item => item.key === desired.key);
      if (!row || row.comment !== comment || row.type !== desired.type || row.target?.length !== 1 || row.target[0] !== "production") throw new Error(`Vercel ${desired.key} installation could not be verified. Rerun.`);
      state.envs[desired.key] = { hash: valueHash, metadata: hash(metadata(row)) };
      state.pendingEnv = null;
      await save();
    }
    const release = hash({ sha: state.sha, env: desiredRows, settings: state.projectSettings });
    if (state.deployment?.release !== release) {
      // Vercel deduplicates equivalent creates; also recover lost responses by metadata.
      const deployments = await api.vercel(`/v6/deployments?projectId=${project.id}&limit=100`);
      let deployment = deployments.deployments?.find(item => item.meta?.formaRelease === release);
      if (!deployment) deployment = await api.vercel("/v13/deployments", { method: "POST", body: { name: config.projectName, project: project.id, target: "production", gitSource: { type: "github", repoId: String(repo.id), ref: state.sha, sha: state.sha }, meta: { formaRelease: release } } });
      state.deployment = { id: deployment.id || deployment.uid, release };
      if (!state.deployment.id) throw new Error("Vercel deployment response had no ID. Rerun to reconcile.");
      await save();
    }
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const deployment = await api.vercel(`/v13/deployments/${state.deployment.id}`);
      if (deployment.projectId !== project.id || deployment.target !== "production" || deployment.meta?.formaRelease !== release) throw new Error("Vercel deployment identity mismatch.");
      if (["ERROR", "CANCELED"].includes(deployment.readyState)) throw new Error("Vercel build failed/canceled. Inspect build logs in Vercel, fix the source and deploy through Git. Provisioned resources are preserved.");
      if (deployment.readyState === "READY") { ready = true; break; }
      if (attempt % 3 === 0) log("Vercel is building the production deployment…");
      await pause(5000);
    }
    if (!ready) throw new Error("Vercel is still building. Rerun kickstart:deploy to resume waiting on the same deployment.");
    for (const route of ["/", "/login"]) {
      let response;
      try { response = await fetcher(config.origin + route, { redirect: "manual", signal: AbortSignal.timeout(20000) }); }
      catch { throw new Error("Production HTTPS check failed. Check domain/DNS and rerun."); }
      if (response.status !== 200) throw new Error("Production page check failed. Check domain routing and Vercel deployment protection; rerun after resolving.");
    }
    state.completedAt = new Date().toISOString();
    await save();
    log(`Production ready: ${config.origin}. GitHub: https://github.com/${config.repo}. Verify authenticated/payment flows separately.`);
  } };
  return { probe, prepare, activate, finish };
}
