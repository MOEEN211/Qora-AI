import { readFile, readdir, lstat, realpath, mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, relative, dirname, join, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { digest } from "./core.mjs";

const execute = promisify(execFile);
const excluded = /^(?:\.env(?:\..*)?|\.git|\.kickstart|\.secrets|\.vercel|\.next|\.source|node_modules|artifacts|test-results|playwright-report|blob-report|coverage|work|tmp|\.temp|\.branches)$/i;
export function excludedSource(path) {
  return path.split("/").some(part => (part !== ".env.example" && excluded.test(part)) || /\.(?:pem|key|p12|pfx|log|tsbuildinfo|zip|bak)$/i.test(part));
}
export async function sourceSnapshot(root, env) {
  const canonicalRoot = await realpath(root);
  const { sourcePaths } = JSON.parse(await readFile(join(root, "config/deployment.json"), "utf8"));
  if (!Array.isArray(sourcePaths) || !sourcePaths.length) throw new Error("Configure sourcePaths in config/deployment.json.");
  const files = new Map();
  const secrets = Object.entries(env).filter(([key, value]) => /(?:TOKEN|SECRET|PASSWORD|API_KEY)/.test(key) && !key.startsWith("NEXT_PUBLIC_") && value?.length >= 8).map(([, value]) => value);
  let size = 0;
  async function visit(path) {
    if (excludedSource(path)) return;
    const absolute = resolve(root, path);
    const rel = relative(resolve(root), absolute);
    if (!rel || rel.startsWith("..") || rel.includes(":")) throw new Error("Deployment source must stay inside this workspace.");
    let stat;
    try { stat = await lstat(absolute); } catch (error) { if (error.code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink()) throw new Error("Deployment source contains a symbolic link. Replace it with an ordinary file before deploying.");
    const canonicalRelative = relative(canonicalRoot, await realpath(absolute));
    if (canonicalRelative.startsWith("..") || canonicalRelative.includes(":")) throw new Error("Deployment source resolves outside this workspace.");
    if (stat.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) await visit(`${path}/${entry}`);
      return;
    }
    if (!stat.isFile()) throw new Error("Deployment source contains a non-regular file.");
    if (files.has(path)) return;
    if (stat.size > 50 * 1024 * 1024 || (size += stat.size) > 200 * 1024 * 1024) throw new Error("Deployment source exceeds the 50 MB file / 200 MB total limit. Remove generated artifacts from sourcePaths.");
    const data = await readFile(absolute);
    const text = data.toString("utf8");
    if (secrets.some(secret => text.includes(secret)) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:ghp_|github_pat_|sk_live_|sk_test_|sb_secret_)[A-Za-z0-9_]{24,}/.test(text)) throw new Error("Deployment source contains a credential. Remove it from the source before retrying; no contents were logged.");
    files.set(path, data);
  }
  for (const path of sourcePaths) {
    if (typeof path !== "string" || !/^[A-Za-z0-9_.\/-]+$/.test(path) || path.split("/").some(p => p === ".." || p === "." || !p)) throw new Error("Invalid deployment source path.");
    await visit(path);
  }
  for (const name of ["package.json", "package-lock.json", ".gitignore"]) if (!files.has(name)) throw new Error(`Deployment source is missing ${name}.`);
  const sorted = [...files].sort(([a], [b]) => a.localeCompare(b, "en"));
  return { files: sorted, hash: digest(sorted.map(([name, data]) => `${name}\0${digest(data)}`).join("\n")), size };
}

export async function git(args, cwd, credentials = {}) {
  // No credentials in command arguments, persisted remotes, hooks, or output.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(?:GIT_|GCM_)/i.test(key)));
  Object.assign(env, { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "credential.helper", GIT_CONFIG_VALUE_0: "", GIT_CONFIG_KEY_1: "core.hooksPath", GIT_CONFIG_VALUE_1: process.platform === "win32" ? "NUL" : "/dev/null", GIT_CONFIG_KEY_2: "core.autocrlf", GIT_CONFIG_VALUE_2: "false" });
  if (credentials.token) Object.assign(env, { GIT_CONFIG_COUNT: "4", GIT_CONFIG_KEY_3: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_3: `Authorization: Basic ${Buffer.from(`x-access-token:${credentials.token}`).toString("base64")}` });
  if (credentials.user) Object.assign(env, { GIT_AUTHOR_NAME: credentials.user.login, GIT_COMMITTER_NAME: credentials.user.login, GIT_AUTHOR_EMAIL: `${credentials.user.id}+${credentials.user.login}@users.noreply.github.com`, GIT_COMMITTER_EMAIL: `${credentials.user.id}+${credentials.user.login}@users.noreply.github.com` });
  try { return (await execute("git", args, { cwd, env, windowsHide: true, timeout: 120000, maxBuffer: 4 * 1024 * 1024 })).stdout.trim(); }
  catch { throw new Error("Git operation failed. Check Git installation, GitHub token Contents write permission, repository access, and branch protection. No credentials or Git output were logged."); }
}

export async function pushSnapshot({ snapshot, config, token, user, parent, beforePush, runGit = git }) {
  const temporary = await mkdtemp(join(tmpdir(), "forma-deploy-"));
  const remote = `https://github.com/${config.repo}.git`;
  const credentials = { token, user };
  try {
    await runGit(["init", "--initial-branch=main", "."], temporary);
    if (parent) {
      await runGit(["fetch", "--no-tags", remote, "refs/heads/main"], temporary, credentials);
      if (await runGit(["rev-parse", "FETCH_HEAD"], temporary) !== parent) throw new Error("GitHub changed since preflight. Rerun; no force-push is performed.");
    }
    for (const [name, data] of snapshot.files) {
      await mkdir(dirname(join(temporary, name)), { recursive: true });
      await writeFile(join(temporary, name), data);
    }
    await runGit(["add", "--force", "--all"], temporary);
    const tree = await runGit(["write-tree"], temporary);
    let sha;
    if (parent && tree === await runGit(["rev-parse", `${parent}^{tree}`], temporary)) sha = parent;
    else sha = await runGit(["commit-tree", tree, ...(parent ? ["-p", parent] : []), "-m", "Deploy application source with kickstart"], temporary, credentials);
    await beforePush(sha);
    if (sha !== parent) await runGit(["push", remote, `${sha}:refs/heads/main`], temporary, credentials);
    return sha;
  } finally {
    // Validate the absolute target before any recursive cleanup on Windows.
    if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith("forma-deploy-")) throw new Error("Unsafe temporary cleanup path.");
    await rm(temporary, { recursive: true, force: true });
  }
}
