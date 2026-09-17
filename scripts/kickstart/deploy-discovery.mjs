import { createInterface } from "node:readline/promises";
import { digest } from "./core.mjs";
import { deploymentApi } from "./deploy-api.mjs";

export async function chooseTeam(teams) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Multiple Vercel teams are accessible. Run kickstart:deploy in an interactive terminal to select one, or set optional VERCEL_TEAM_ID for unattended setup.");
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    teams.forEach((team, index) => console.log(`${index + 1}. ${String(team.name || team.slug || team.id).replace(/[\x00-\x1f\x7f-\x9f]/g, "")}`));
    const answer = await terminal.question("Which Vercel team should own this app? Enter its number: ");
    if (!/^\d+$/.test(answer) || !teams[Number(answer) - 1]) throw new Error("No valid team selected. No provider changes were made.");
    return teams[Number(answer) - 1].id;
  } finally { terminal.close(); }
}

// Read-only discovery; returned values are persisted only after global preflight.
export async function discoverDeployment({ env, state = {}, api, choose = chooseTeam }) {
  const missing = ["GITHUB_TOKEN", "VERCEL_TOKEN"].filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Fill deployment fields in .env: ${missing.join(", ")}. See docs/DEPLOYMENT.md.`);
  const resolved = { ...env };
  api ||= deploymentApi(resolved);
  const user = await api.github("/user");
  if (!Number.isSafeInteger(user.id) || !/^[a-zA-Z0-9-]+$/.test(user.login)) throw new Error("Could not identify the GitHub account from its token.");
  if (state.githubUserId && state.githubUserId !== user.id) throw new Error("GitHub token belongs to a different account than this deployment receipt.");
  const recordedRepo = state.target?.repo || env.GITHUB_REPOSITORY;
  resolved.GITHUB_OWNER ||= recordedRepo?.split("/")[0] || user.login;
  resolved.GITHUB_REPO_NAME ||= recordedRepo?.split("/")[1];
  resolved.VERCEL_TEAM_ID ||= state.target?.team;
  resolved.VERCEL_PROJECT_NAME ||= state.target?.name;
  resolved.GITHUB_REPO_ID ||= state.repoId ? String(state.repoId) : "";
  resolved.VERCEL_PROJECT_ID ||= state.projectId || "";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(resolved.GITHUB_OWNER)) throw new Error("Invalid optional GITHUB_OWNER.");
  if (resolved.GITHUB_REPO_ID && !resolved.GITHUB_REPO_NAME) throw new Error("An existing GITHUB_REPO_ID also needs the optional GITHUB_REPO_NAME, or its original receipt.");
  if (!resolved.VERCEL_TEAM_ID) {
    const teams = new Map();
    const cursors = new Set();
    let until;
    do {
      const page = await api.vercel(`/v2/teams?limit=100${until != null ? `&until=${until}` : ""}`, { scope: false });
      if (!Array.isArray(page.teams)) throw new Error("Vercel team discovery failed. Check the token's team access.");
      for (const team of page.teams) {
        if (!/^team_[a-zA-Z0-9]+$/.test(team.id)) throw new Error("Vercel returned an invalid team identifier.");
        teams.set(team.id, team);
      }
      const next = page.pagination?.next;
      if (next != null && (!Number.isSafeInteger(next) || cursors.has(next))) throw new Error("Vercel team pagination did not advance.");
      cursors.add(next);
      until = next;
      if (teams.size > 1000) throw new Error("Set optional VERCEL_TEAM_ID for this large account.");
    } while (until != null);
    const choices = [...teams.values()];
    if (!choices.length) throw new Error("No Vercel team is accessible. Create a token scoped to your intended team.");
    const selected = choices.length === 1 ? choices[0].id : await choose(choices);
    if (!teams.has(selected)) throw new Error("The selected Vercel team is not accessible to this token.");
    resolved.VERCEL_TEAM_ID = selected;
  }
  if (!/^team_[a-zA-Z0-9]+$/.test(resolved.VERCEL_TEAM_ID)) throw new Error("Invalid optional VERCEL_TEAM_ID.");
  const slug = (env.APP_NAME || "saas").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45).replace(/-$/, "") || "saas";
  const base = slug.length < 2 ? `${slug}-app` : slug;
  const suffix = digest(`${env.SUPABASE_PROJECT_REF}:${resolved.GITHUB_OWNER}:${resolved.VERCEL_TEAM_ID}`).slice(0, 8);
  async function unusedName(probe) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const name = attempt === 0 ? base : `${base}-${suffix}${attempt > 1 ? `-${attempt}` : ""}`;
      if (!await probe(name)) return name;
    }
    throw new Error("Could not find an unused generated name. Set an optional repository/project name override.");
  }
  if (!resolved.GITHUB_REPO_NAME) resolved.GITHUB_REPO_NAME = await unusedName(name => api.github(`/repos/${resolved.GITHUB_OWNER}/${name}`, { missing: true }));
  if (!resolved.VERCEL_PROJECT_NAME) resolved.VERCEL_PROJECT_NAME = await unusedName(name => api.vercel(`/v9/projects/${name}?teamId=${resolved.VERCEL_TEAM_ID}`, { missing: true, scope: false }));
  const automaticOrigin = !env.APP_URL_LIVE && (state.automaticOrigin ?? !state.target?.origin);
  // Proposed origin for read checks; preparation reads the actual assigned domain.
  resolved.APP_URL_LIVE ||= state.target?.origin || `https://${resolved.VERCEL_PROJECT_NAME}.vercel.app`;
  return { env: resolved, automaticOrigin, githubUserId: user.id };
}
