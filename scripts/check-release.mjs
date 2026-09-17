import { readFile } from 'node:fs/promises';
import { dirname, posix } from 'node:path';
import { parseEnv } from 'node:util';
import { sourceSnapshot } from './kickstart/deploy-source.mjs';

// Uses the same guarded source allowlist as deployment. Never reads real .env.
const snapshot = await sourceSnapshot(process.cwd(), {});
const files = new Map(snapshot.files);
for (const name of ['README.md', 'AGENTS.md', 'LICENSE.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md', '.env.example', '.github/verify.yml.example']) {
  if (!files.has(name)) throw new Error(`Required buyer source is missing: ${name}`);
}
const example = parseEnv(files.get('.env.example').toString('utf8'));
for (const [key,value] of Object.entries(example)) {
  if (value && /TOKEN|SECRET|PASSWORD|API_KEY|PROJECT_REF|PROJECT_ID|TEAM_ID|REPO_ID|PUBLISHABLE_KEY|SUPABASE_URL|TEMPLATE_.*_ID/.test(key)) throw new Error(`Generated or credential field must be blank in .env.example: ${key}`);
}
const failures = [];
for (const [name, data] of files) {
  if (!(name.endsWith('.md') && !name.startsWith('public/') && !name.startsWith('content/'))) continue;
  const text = data.toString('utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(?:[a-z]+:|\/)/i.test(target)) continue;
    const path = posix.normalize(posix.join(dirname(name).replaceAll('\\','/'), decodeURIComponent(target)));
    if (!files.has(path)) failures.push(`${name} -> ${path}`);
  }
}
if (failures.length) throw new Error(`Broken local documentation links:\n${failures.join('\n')}`);
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const group of ['dependencies','devDependencies']) {
  if (JSON.stringify(lock.packages[''][group]) !== JSON.stringify(pkg[group])) throw new Error(`Root lockfile ${group} differ from package.json.`);
}
console.log(`Buyer source check passed: ${files.size} files; example credentials empty; local Markdown links resolve.`);
