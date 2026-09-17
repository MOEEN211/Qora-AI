export function deploymentApi(env, fetcher = fetch) {
  async function request(provider, path, { method = "GET", body, missing = false, scope = true } = {}) {
    const url = new URL(path, provider === "GitHub" ? "https://api.github.com" : "https://api.vercel.com");
    if (provider === "Vercel" && scope && env.VERCEL_TEAM_ID) url.searchParams.set("teamId", env.VERCEL_TEAM_ID);
    let response;
    try {
      response = await fetcher(url, {
        method, redirect: "error", signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${provider === "GitHub" ? env.GITHUB_TOKEN : env.VERCEL_TOKEN}`, "Content-Type": "application/json", ...(provider === "GitHub" ? { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10" } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new Error(`${provider} connection failed. Rerun to reconcile any completed operation.`); }
    if (missing && response.status === 404) return null;
    if (!response.ok) {
      // Classify documented failures without echoing arbitrary provider text.
      let hint = "Check token, target access and permissions in docs/DEPLOYMENT.md.";
      if (provider === "GitHub" && response.status === 403 && method === "POST" && (path === "/user/repos" || /^\/orgs\/[^/]+\/repos$/.test(path))) hint = "Repository creation was denied. Give the fine-grained token Administration: Read and write and repository access covering new repositories (All repositories); confirm the resource owner and any organization approval.";
      throw new Error(`${provider} HTTP ${response.status}. ${hint} Provider bodies are withheld to protect secrets.`);
    }
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new Error(`${provider} returned an unreadable response. Rerun to reconcile.`); }
  }
  return { github: (path, options) => request("GitHub", path, options), vercel: (path, options) => request("Vercel", path, options) };
}
