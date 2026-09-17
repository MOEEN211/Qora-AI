// Add only onboarding to an existing managed project, preserving its active origin.
import { readFile, readdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, digest, executeSetup, migrationQuery } from './core.mjs';
import { verifyOnboarding } from './onboarding.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Usage: npm run kickstart:onboarding [-- --check]');
const env = { ...process.env, ...parseEnv(await readFile(resolve(root, '.env'), 'utf8')) };
const api = createApi(env);
const names = (await readdir(resolve(root, 'supabase/migrations'))).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
const migrations = await Promise.all(names.map(async name => ({ name, sql: await readFile(resolve(root, 'supabase/migrations', name), 'utf8') })));
const selected = migrations.filter(m => m.name.endsWith('_account_onboarding.sql'));
const probes = [
  { name: 'Hosted project and saved target', run: async () => {
    const project = await api.management('');
    if (project.id !== env.SUPABASE_PROJECT_REF || project.status !== 'ACTIVE_HEALTHY') throw new Error('Configured hosted project identity or health did not match.');
    const receipt = JSON.parse(await readFile(resolve(root, '.kickstart', `${env.SUPABASE_PROJECT_REF}.json`), 'utf8'));
    if (receipt.project !== project.id) throw new Error('Restore the matching kickstart receipt.');
  } },
  { name: 'Supabase publishable key', run: () => api.authSettings() },
  { name: 'Installed core and immutable migration ledger', run: async () => {
    const rows = await api.query('select version,checksum from private.kickstart_migrations');
    for (const row of rows) {
      const source = migrations.find(m => m.name === row.version);
      if (!source || digest(source.sql) !== row.checksum) throw new Error('Restore migrations matching the installed checksum ledger before continuing.');
    }
    const [core] = await api.query("select to_regclass('public.profiles') is not null and to_regprocedure('private.is_verified_user()') is not null as ready");
    if (!rows.length || !core.ready || selected.length !== 1) throw new Error('Install the core application with kickstart first.');
    return 'Read access verified; DDL permission can only be confirmed during migration.';
  } },
];
const steps = [
  ...selected.map(m => ({ name: `Migration ${m.name}`, run: () => api.query(migrationQuery(m.name, m.sql), false) })),
  { name: 'Verify onboarding schema and permissions', run: () => verifyOnboarding(api) },
];
const result = await executeSetup({ env, probes, steps, checkOnly: args.includes('--check'), log: item => console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.message ? `: ${item.message}` : ''}`) });
if (['blocked','partial'].includes(result.status)) {
  console.error(result.status === 'blocked' ? 'Preflight failed. No provisioning changes made.' : `Stopped at ${result.failed}: ${result.message} Rerun safely after fixing the error.`);
  process.exitCode = 1;
} else console.log(result.status === 'checked' ? 'Read-only onboarding checks passed. DDL permission remains unverified until installation.' : 'Onboarding installed and verified. Auth/email origins and existing receipts are preserved.');
